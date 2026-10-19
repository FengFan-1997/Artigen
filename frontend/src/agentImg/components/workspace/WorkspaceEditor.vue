<template>
  <div
    class="workspace-code-editor"
    :style="{
      '--code-background': palette.background,
      '--code-foreground': palette.foreground
    }"
    :aria-label="label"
  >
    <div ref="host" class="editor-host"></div>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { basicSetup } from '@uiw/codemirror-extensions-basic-setup';
import { EditorView, keymap } from '@codemirror/view';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  defaultSettingsVscodeDark,
  defaultSettingsVscodeLight,
  vscodeDark,
  vscodeLight
} from '@uiw/codemirror-theme-vscode';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    path: string;
    theme: 'light' | 'dark';
    readonly?: boolean;
    label?: string;
  }>(),
  { readonly: false, label: '文件编辑器' }
);
const emit = defineEmits<{ 'update:modelValue': [value: string]; save: [] }>();
const host = ref<HTMLElement | null>(null);
const themeSlot = new Compartment();
const selectedTheme = () => (props.theme === 'light' ? vscodeLight : vscodeDark);
const palette = computed(() =>
  props.theme === 'light' ? defaultSettingsVscodeLight : defaultSettingsVscodeDark
);
let editor: EditorView | null = null;
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
  } else if (['html', 'htm'].includes(extension || '')) {
    const { html } = await import('@codemirror/lang-html');
    language = [html()];
  } else if (['css', 'scss', 'less'].includes(extension || '')) {
    const { css } = await import('@codemirror/lang-css');
    language = [css()];
  }
  if (ticket !== revision || !host.value) return;
  editor?.destroy();
  editor = null;
  host.value.replaceChildren();

  // The upstream VS Code theme owns editor colors; local styles only adapt geometry.
  const geometry = EditorView.theme({
    '&': { height: '100%', fontSize: '13px' },
    '.cm-scroller': { overflow: 'auto', lineHeight: '1.65' },
    '.cm-content': { padding: '12px 0' }
  });
  editor = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup({
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          crosshairCursor: false
        }),
        ...language,
        themeSlot.of(selectedTheme()),
        geometry,
        EditorView.contentAttributes.of({ 'aria-label': props.label }),
        EditorState.readOnly.of(props.readonly),
        EditorView.editable.of(!props.readonly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
        }),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              emit('save');
              return true;
            }
          }
        ])
      ]
    })
  });
}

watch(
  () => props.theme,
  () => editor?.dispatch({ effects: themeSlot.reconfigure(selectedTheme()) })
);
watch(
  () => props.modelValue,
  (value) => {
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }
);
watch(
  () => [props.path, props.readonly],
  () => void mountEditor()
);
onMounted(() => void mountEditor());
onBeforeUnmount(() => {
  revision++;
  editor?.destroy();
});
</script>
<style scoped>
.workspace-code-editor {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--code-background);
}
.editor-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
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
