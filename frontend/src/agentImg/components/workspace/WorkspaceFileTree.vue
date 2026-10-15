<template>
  <ul class="file-tree">
    <li v-for="node in nodes" :key="node.id">
      <button
        type="button"
        :class="{ selected: active === node.id }"
        :aria-expanded="node.directory ? expanded.has(node.id) : undefined"
        @click="choose(node)"
      >
        <WorkspaceIcon
          :name="
            node.directory
              ? expanded.has(node.id)
                ? 'chevron-down'
                : 'chevron-right'
              : node.mimeType?.startsWith('image/')
                ? 'image'
                : 'file'
          "
          :size="14"
        /><span>{{ node.name }}</span>
      </button>
      <p v-if="errors[node.id]" role="status">{{ errors[node.id] }}</p>
      <WorkspaceFileTree
        v-if="expanded.has(node.id)"
        :nodes="children[node.id] || node.children || []"
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
  active?: string;
  readDirectory?: (node: TreeNode) => Promise<TreeNode[]>;
}>();
const emit = defineEmits<{ open: [node: TreeNode] }>();
const expanded = ref(new Set<string>());
const children = ref<Record<string, TreeNode[]>>({});
const errors = ref<Record<string, string>>({});
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
  if (props.readDirectory && !children.value[node.id]) {
    try {
      children.value[node.id] = await props.readDirectory(node);
    } catch {
      errors.value[node.id] = '无法读取目录，请重新授权后重试。';
      expanded.value.delete(node.id);
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
  display: flex;
  align-items: center;
  gap: 7px;
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
.file-tree button:hover,
.file-tree button.selected {
  background: var(--surface-hover);
}
.file-tree span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tree p {
  font-size: 12px;
  color: var(--danger);
}
@media (max-width: 799px) {
  .file-tree button {
    min-height: 44px;
  }
}
</style>
