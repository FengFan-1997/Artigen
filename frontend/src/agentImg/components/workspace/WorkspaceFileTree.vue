<template>
  <ul class="file-tree">
    <li v-for="node in nodes" :key="node.id">
      <button
        type="button"
        :class="{ selected: active === node.id }"
        :aria-expanded="node.directory ? expanded.has(node.id) : undefined"
        :aria-busy="node.directory ? loading.has(node.id) : undefined"
        :aria-current="!node.directory && active === node.id ? 'page' : undefined"
        @click="choose(node)"
      >
        <span class="file-tree-caret" aria-hidden="true">
          <WorkspaceIcon
            v-if="node.directory"
            :name="expanded.has(node.id) ? 'chevron-down' : 'chevron-right'"
            :size="14"
          />
        </span>
        <WorkspaceIcon
          class="file-tree-kind"
          :name="
            node.directory
              ? 'folder'
              : node.mimeType?.startsWith('image/')
                ? 'image'
                : 'file'
          "
          :size="14"
        /><span class="file-tree-name">{{ node.name }}</span>
      </button>
      <p v-if="loading.has(node.id) || errors[node.id]" class="directory-feedback" role="status">
        {{ loading.has(node.id) ? (zh ? '正在读取目录…' : 'Reading folder…') : (zh ? '目录暂时无法读取，点击文件夹重试。' : 'Could not read this folder. Select it to retry.') }}
      </p>
      <WorkspaceFileTree
        v-if="expanded.has(node.id)"
        :nodes="children[node.id] || node.children || []"
        :zh="zh"
        :active="active"
        :read-directory="readDirectory"
        @open="$emit('open', $event)"
      />
    </li>
  </ul>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import WorkspaceIcon from './WorkspaceIcon.vue';
import type { TreeNode } from '../../services/workspaceTree';
const props = defineProps<{
  nodes: TreeNode[];
  zh: boolean;
  active?: string;
  readDirectory?: (node: TreeNode) => Promise<TreeNode[]>;
}>();
const emit = defineEmits<{ open: [node: TreeNode] }>();
const expanded = ref(new Set<string>());
const children = ref<Record<string, TreeNode[]>>({});
const errors = ref<Record<string, boolean>>({});
const loading = ref(new Set<string>());
async function choose(node: TreeNode) {
  if (!node.directory) {
    emit('open', node);
    return;
  }
  if (expanded.value.has(node.id)) {
    expanded.value.delete(node.id);
    return;
  }
  expanded.value.add(node.id);
  if (props.readDirectory && !children.value[node.id] && !loading.value.has(node.id)) {
    loading.value.add(node.id);
    delete errors.value[node.id];
    try {
      children.value[node.id] = await props.readDirectory(node);
    } catch {
      errors.value[node.id] = true;
      expanded.value.delete(node.id);
    } finally {
      loading.value.delete(node.id);
    }
  }
}
</script>
<style scoped>
.file-tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
.file-tree .file-tree {
  padding-left: 13px;
}
.file-tree button {
  display: grid;
  grid-template-columns: 12px 14px minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  width: 100%;
  min-width: 0;
  min-height: 32px;
  padding: 6px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.file-tree-caret {
  display: grid;
  width: 12px;
  place-items: center;
  color: var(--muted);
}
.file-tree-kind {
  color: var(--muted);
}
.file-tree button:hover,
.file-tree button.selected {
  background: var(--surface-hover);
}
.file-tree button[aria-current='page'] {
  font-weight: 600;
}
.file-tree button[aria-current='page'] .file-tree-kind {
  color: var(--acid-text);
}
.file-tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree button:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.directory-feedback {
  margin: 4px 7px 8px 43px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 799px), (pointer: coarse) {
  .file-tree button {
    min-height: 44px;
  }
}
</style>
