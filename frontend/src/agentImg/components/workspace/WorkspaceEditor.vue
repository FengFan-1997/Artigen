<template>
  <div
    class="workspace-code-editor"
    :aria-label="label"
    :data-comparison-layout="
      compareTo === undefined
        ? undefined
        : identical
          ? 'unchanged'
          : inlineComparison
            ? 'inline'
            : 'split'
    "
  >
    <div
      v-if="compareTo !== undefined && !identical"
      class="diff-labels"
      :class="{ inline: inlineComparison }"
    >
      <span>{{ originalLabel }}</span
      ><span>{{ modifiedLabel }}</span>
    </div>
    <div v-if="identical" class="diff-no-changes" role="status">{{ noChangesLabel }}</div>
    <div v-show="!identical" ref="host" class="editor-host"></div>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
const props = withDefaults(
  defineProps<{
    modelValue: string;
    path: string;
    readonly?: boolean;
    compareTo?: string;
    label?: string;
    originalLabel?: string;
    modifiedLabel?: string;
    noChangesLabel?: string;
  }>(),
  {
    readonly: false,
    label: '文件编辑器',
    originalLabel: 'Original',
    modifiedLabel: 'Modified',
    noChangesLabel: 'No changes between these versions.'
  }
);
const emit = defineEmits<{ 'update:modelValue': [value: string]; save: [] }>();
const host = ref<HTMLElement | null>(null);
const identical = computed(
  () => props.compareTo !== undefined && props.compareTo === props.modelValue
);
const inlineComparison = ref(false);
let observer: ResizeObserver | null = null;
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
  if (identical.value) return;
  const theme = EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'var(--editor-surface)',
      color: 'var(--text)',
      fontSize: '13px'
    },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace,SFMono-Regular,monospace' },
    '.cm-content': { caretColor: 'var(--focus)', padding: '16px 0' },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-gutter)',
      color: 'var(--muted)',
      borderRight: '1px solid var(--border)'
    },
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
    const readonly = [
      ...extensions,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping
    ];
    if (inlineComparison.value) {
      editor = new EditorView({
        parent: host.value,
        doc: props.modelValue,
        extensions: [
          ...readonly,
          unifiedMergeView({
            original: props.compareTo,
            mergeControls: false,
            highlightChanges: true,
            gutter: true
          })
        ]
      });
    } else {
      merge = new MergeView({
        parent: host.value,
        a: { doc: props.compareTo, extensions: readonly },
        b: { doc: props.modelValue, extensions: readonly },
        highlightChanges: true,
        gutter: true
      });
    }
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
    if (props.compareTo !== undefined) {
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
onMounted(() => {
  inlineComparison.value = (host.value?.clientWidth || 0) < 720;
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width || 0;
    if (!width) return;
    const inline = width < 720;
    if (inline !== inlineComparison.value) {
      inlineComparison.value = inline;
      // Comparisons are readonly. Normal editors keep their undo/selection on resize.
      if (props.compareTo !== undefined && !identical.value) void mountEditor();
    }
  });
  if (host.value) observer.observe(host.value);
  void mountEditor();
});
onBeforeUnmount(() => {
  revision++;
  observer?.disconnect();
  editor?.destroy();
  merge?.destroy();
});
</script>
<style scoped>
.workspace-code-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--editor-surface);
}
.editor-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.diff-labels {
  display: grid;
  flex: none;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--border);
  background: var(--editor-gutter);
  color: var(--muted);
  font-size: 12px;
}
.diff-labels span {
  min-width: 0;
  padding: 10px 14px;
  overflow-wrap: anywhere;
}
.diff-labels span + span {
  border-left: 1px solid var(--panel-border);
}
.diff-labels.inline {
  display: flex;
  align-items: center;
}
.diff-labels.inline span + span {
  border-left: 0;
  padding-left: 0;
}
.diff-labels.inline span + span::before {
  content: '→';
  margin-right: 14px;
}
.diff-no-changes {
  display: grid;
  flex: 1;
  min-height: 140px;
  padding: 24px;
  place-content: center;
  color: var(--muted);
  text-align: center;
  font-size: 13px;
}
.workspace-code-editor :deep(.cm-mergeView) {
  height: 100%;
  overflow: auto;
}
.workspace-code-editor :deep(.cm-mergeViewEditors) {
  height: 100%;
}
.workspace-code-editor :deep(.cm-editor) {
  height: 100%;
}
.workspace-code-editor :deep(.cm-mergeViewEditor + .cm-mergeViewEditor) {
  border-left: 1px solid var(--panel-border);
}
.workspace-code-editor :deep(.cm-merge-a .cm-changedLine) {
  background: color-mix(in srgb, var(--danger) 11%, var(--editor-surface));
}
.workspace-code-editor :deep(.cm-merge-b .cm-changedLine),
.workspace-code-editor :deep(.cm-inlineChangedLine) {
  background: color-mix(in srgb, var(--success) 11%, var(--editor-surface));
}
.workspace-code-editor :deep(.cm-merge-a .cm-changedLineGutter),
.workspace-code-editor :deep(.cm-deletedLineGutter) {
  background: var(--danger);
}
.workspace-code-editor :deep(.cm-merge-b .cm-changedLineGutter) {
  background: var(--success);
}
.workspace-code-editor :deep(.cm-deletedChunk) {
  background: color-mix(in srgb, var(--danger) 11%, var(--editor-surface));
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
