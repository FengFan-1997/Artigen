<template><div ref="host" class="workspace-code-editor" :aria-label="label"></div></template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { MergeView } from '@codemirror/merge';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
const props = withDefaults(
  defineProps<{
    modelValue: string;
    path: string;
    readonly?: boolean;
    compareTo?: string;
    label?: string;
  }>(),
  { readonly: false, label: '文件编辑器' }
);
const emit = defineEmits<{ 'update:modelValue': [value: string]; save: [] }>();
const host = ref<HTMLElement | null>(null);
let editor: EditorView | null = null;
let merge: MergeView | null = null;
let revision = 0;
async function mountEditor() {
  const ticket = ++revision;
  let language: Extension[] = [];
  const extension = props.path.split('.').at(-1)?.toLowerCase();
  if (['md', 'markdown'].includes(extension || '')) {
    const { markdown } = await import('@codemirror/lang-markdown');
    language = [markdown()];
  } else if (['js', 'jsx', 'ts', 'tsx'].includes(extension || '')) {
    const { javascript } = await import('@codemirror/lang-javascript');
    language = [
      javascript({ typescript: extension?.startsWith('t'), jsx: extension?.endsWith('x') })
    ];
  } else if (extension === 'json') {
    const { json } = await import('@codemirror/lang-json');
    language = [json()];
  } else if (extension === 'html') {
    const { html } = await import('@codemirror/lang-html');
    language = [html()];
  } else if (extension === 'css') {
    const { css } = await import('@codemirror/lang-css');
    language = [css()];
  }
  if (ticket !== revision || !host.value) return;
  editor?.destroy();
  merge?.destroy();
  editor = null;
  merge = null;
  host.value.replaceChildren();
  const theme = EditorView.theme({
    '&': { height: '100%', backgroundColor: 'var(--bg)', color: 'var(--text)', fontSize: '13px' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace,SFMono-Regular,monospace' },
    '.cm-content': { caretColor: 'var(--focus)', padding: '16px 0' },
    '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--muted)', border: 'none' },
    '.cm-activeLine,.cm-activeLineGutter': { backgroundColor: 'var(--surface)' },
    '&.cm-focused .cm-selectionBackground,.cm-selectionBackground': {
      backgroundColor: 'var(--surface-hover)'
    },
    '.cm-cursor': { borderLeftColor: 'var(--focus)' },
    '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)' },
    '.cm-search input,.cm-search button': {
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      borderColor: 'var(--border)'
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--surface-hover)',
      color: 'var(--text)',
      outline: '1px solid var(--focus)'
    }
  });
  const extensions = [
    basicSetup,
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: [tags.keyword, tags.operator, tags.heading], color: 'var(--acid-text)' },
        { tag: [tags.string, tags.regexp, tags.attributeValue], color: 'var(--success)' },
        {
          tag: [tags.number, tags.bool, tags.null, tags.atom, tags.typeName],
          color: 'var(--warning)'
        },
        { tag: [tags.comment, tags.meta], color: 'var(--muted)' },
        {
          tag: [tags.propertyName, tags.variableName, tags.attributeName, tags.tagName],
          color: 'var(--text)'
        },
        { tag: [tags.link, tags.url], color: 'var(--acid-text)', textDecoration: 'underline' }
      ])
    ),
    ...language,
    theme,
    EditorView.contentAttributes.of({ 'aria-label': props.label }),
    keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          emit('save');
          return true;
        }
      }
    ])
  ];
  if (props.compareTo !== undefined) {
    const readonly = [...extensions, EditorState.readOnly.of(true), EditorView.editable.of(false)];
    merge = new MergeView({
      parent: host.value,
      a: { doc: props.compareTo, extensions: readonly },
      b: { doc: props.modelValue, extensions: readonly },
      highlightChanges: true
    });
  } else
    editor = new EditorView({
      parent: host.value,
      state: EditorState.create({
        doc: props.modelValue,
        extensions: [
          ...extensions,
          EditorState.readOnly.of(props.readonly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
          })
        ]
      })
    });
}
watch(
  () => props.modelValue,
  (value) => {
    if (merge) {
      void mountEditor();
      return;
    }
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }
);
watch(
  () => [props.path, props.readonly, props.compareTo],
  () => {
    void mountEditor();
  }
);
onMounted(() => void mountEditor());
onBeforeUnmount(() => {
  revision++;
  editor?.destroy();
  merge?.destroy();
});
</script>
<style scoped>
.workspace-code-editor {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.workspace-code-editor :deep(.cm-mergeView) {
  height: 100%;
}
.workspace-code-editor :deep(.cm-mergeViewEditors) {
  height: 100%;
}
.workspace-code-editor :deep(.cm-editor) {
  height: 100%;
}
.workspace-code-editor :deep(.cm-merge-a) {
  background: color-mix(in srgb, var(--danger) 5%, var(--bg));
}
.workspace-code-editor :deep(.cm-merge-b) {
  background: color-mix(in srgb, var(--success) 5%, var(--bg));
}
.workspace-code-editor :deep(.cm-deletedChunk) {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
.workspace-code-editor :deep(.cm-insertedChunk) {
  background: color-mix(in srgb, var(--success) 12%, transparent);
}
@media (max-width: 799px), (pointer: coarse) {
  .workspace-code-editor :deep(.cm-search input:not([type='checkbox'])),
  .workspace-code-editor :deep(.cm-search button) {
    min-height: 44px;
    font-size: 16px;
  }
  .workspace-code-editor :deep(.cm-search label) {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
}
</style>
