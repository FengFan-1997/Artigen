<template>
  <div class="project-navigation">
    <div class="navigation-caption">
      <span>{{ zh ? '项目' : 'Projects' }}</span
      ><router-link to="/artigen/projects" :aria-label="zh ? '管理项目' : 'Manage projects'"
        ><WorkspaceIcon name="plus"
      /></router-link>
    </div>
    <form v-if="editing" ref="sessionEditor" class="session-editor" :aria-label="zh ? '编辑会话' : 'Edit chat'" :aria-busy="saving" @submit.prevent="save">
      <h2><WorkspaceIcon name="settings" :size="16" />{{ zh ? '编辑会话' : 'Edit chat' }}</h2>
      <label
        >{{ zh ? '会话名称' : 'Chat title' }}<input v-model="title" required maxlength="160"
      /></label>
      <label
        >{{ zh ? '所属项目' : 'Project'
        }}<select v-model="projectChoice">
          <option value="">{{ zh ? '未归类' : 'Ungrouped' }}</option>
          <option v-for="p in projects" :key="p.projectId" :value="p.projectId">
            {{ p.title }}
          </option>
        </select></label
      >
      <p v-if="error === 'save'" class="session-save-error" role="alert">{{ zh ? '会话未保存，输入内容已保留，请重试。' : 'Chat was not saved. Your edits are kept; try again.' }}</p>
      <div>
        <button class="session-cancel" type="button" :disabled="saving" @click="editing = null">
          {{ zh ? '取消' : 'Cancel' }}</button
        ><button class="session-save" type="submit" :disabled="saving">{{ zh ? '保存' : 'Save' }}</button>
      </div>
    </form>
    <p v-if="error === 'load'" role="status">
      {{ zh ? '项目目录暂时无法读取。' : 'Could not load projects.' }}
      <button @click="load(false)">{{ zh ? '重试' : 'Retry' }}</button>
    </p>
    <template v-for="project in visibleProjects" :key="project.projectId">
      <div class="project-heading">
        <button
          :aria-expanded="!collapsed.has(project.projectId)"
          @click="toggle(project.projectId)"
        >
          <WorkspaceIcon
            :name="collapsed.has(project.projectId) ? 'chevron-right' : 'chevron-down'"
            :size="14"
          /><WorkspaceIcon name="folder" /><span>{{ project.title }}</span></button
        ><button
          :aria-label="zh ? `在${project.title}中新建会话` : `New chat in ${project.title}`"
          @click="newChat(project.projectId)"
        >
          <WorkspaceIcon name="plus" />
        </button>
      </div>
      <div v-if="!collapsed.has(project.projectId)" class="project-sessions">
        <div
          v-for="item in filtered(project.projectId)"
          :key="item.id"
          class="session-row"
          :class="{ selected: selected(item) }"
        >
          <router-link
            :to="link(item)"
            :aria-current="selected(item) ? 'page' : undefined"
            :title="item.title"
            @click="$emit('navigate')"
            ><i :class="{ running: active(item.status) }"></i
            ><span>{{ item.title }}</span></router-link
          ><button
            v-if="item.kind === 'conversation'"
            :aria-label="zh ? `编辑会话 ${item.title}` : `Edit chat ${item.title}`"
            @click="
              editing = item;
              title = item.title;
              projectChoice = item.projectId || '';
            "
          >
            <WorkspaceIcon name="settings" :size="14" />
          </button>
        </div>
        <span v-if="!filtered(project.projectId).length" class="empty-project">{{
          zh ? '还没有会话' : 'No chats yet'
        }}</span>
      </div>
    </template>
    <div v-if="filtered(null).length" class="navigation-caption">
      {{ zh ? '未归类' : 'Ungrouped' }}
    </div>
    <div
      v-for="item in filtered(null)"
      :key="item.id"
      class="session-row"
      :class="{ selected: selected(item) }"
    >
      <router-link
        :to="link(item)"
        :aria-current="selected(item) ? 'page' : undefined"
        :title="item.title"
        @click="$emit('navigate')"
        ><i :class="{ running: active(item.status) }"></i><span>{{ item.title }}</span></router-link
      ><button
        v-if="item.kind === 'conversation'"
        :aria-label="zh ? `编辑会话 ${item.title}` : `Edit chat ${item.title}`"
        @click="
          editing = item;
          title = item.title;
          projectChoice = '';
        "
      >
        <WorkspaceIcon name="settings" :size="14" />
      </button>
    </div>
    <p v-if="search && !loading && !error && !visibleProjects.length && !filtered(null).length" class="navigation-empty" role="status">
      {{ zh ? '已加载内容中没有匹配项' : 'No matches in loaded items' }}
    </p>
    <p v-if="error === 'more'" class="navigation-more-error" role="status">
      {{ zh ? '更多会话暂时无法读取，已加载会话仍保留。' : 'Could not load more chats. Your loaded chats are kept.' }}
    </p>
    <button v-if="cursor" type="button" class="load-more" :disabled="loading" :aria-busy="loading" @click="load(true)">
      <span>{{ loading ? (zh ? '正在加载…' : 'Loading…') : error === 'more' ? (zh ? '重试加载更多' : 'Retry loading more') : (zh ? '加载更多会话' : 'Load more chats') }}</span>
      <WorkspaceIcon :name="error === 'more' ? 'refresh' : 'chevron-down'" :size="14" />
    </button>
    <slot v-if="error === 'load' || (!loading && !sessions.length && !projects.length)" />
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import WorkspaceIcon from './WorkspaceIcon.vue';
import {
  getWorkspaceNavigation,
  updateWorkspaceConversation,
  type WorkspaceSession
} from '../../services/workspace';
const props = defineProps<{ zh: boolean; search: string }>();
const emit = defineEmits<{ navigate: [] }>();
const route = useRoute();
const router = useRouter();
const projects = ref<{ projectId: string; title: string }[]>([]);
const sessions = ref<WorkspaceSession[]>([]);
const cursor = ref<string | null>(null);
const error = ref<'' | 'load' | 'more' | 'save'>('');
const loading = ref(false);
const collapsed = ref(new Set<string>());
const editing = ref<WorkspaceSession | null>(null);
const sessionEditor = ref<HTMLFormElement | null>(null);
watch(editing, async (value) => {
  if (!value) return;
  if (error.value === 'save') error.value = '';
  await nextTick();
  const input = sessionEditor.value?.querySelector('input');
  input?.focus({ preventScroll: true });
  input?.scrollIntoView({ block: 'nearest' });
});
const title = ref('');
const projectChoice = ref('');
const saving = ref(false);
let revision = 0;
const filtered = (id: string | null) =>
  sessions.value.filter(
    (s) => s.projectId === id && s.title.toLowerCase().includes(props.search.toLowerCase())
  );
const visibleProjects = computed(() =>
  projects.value.filter(
    (p) =>
      !props.search ||
      p.title.toLowerCase().includes(props.search.toLowerCase()) ||
      filtered(p.projectId).length
  )
);
const active = (status: string) =>
  [
    'planning',
    'queued',
    'running',
    'provisioning',
    'verifying',
    'waiting_authorization',
    'waiting_user'
  ].includes(status);
const selected = (s: WorkspaceSession) =>
  s.kind === 'run' ? route.params.runId === s.id : route.query.c === s.id;
const link = (s: WorkspaceSession) =>
  s.kind === 'run'
    ? `/artigen/agent/runs/${s.id}`
    : {
        path: '/artigen/create',
        query: { c: s.id, ...(s.projectId ? { projectId: s.projectId } : {}) }
      };
const toggle = (id: string) => {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
};
const newChat = (projectId: string) => {
  emit('navigate');
  void router.push({ path: '/artigen/create', query: { projectId } });
};
async function load(append: boolean) {
  if (append && (loading.value || !cursor.value)) return;
  const ticket = ++revision;
  loading.value = true;
  error.value = '';
  try {
    const data = await getWorkspaceNavigation(append ? cursor.value || '' : '');
    if (ticket !== revision) return;
    projects.value = data.projects;
    const merged = append ? [...sessions.value, ...data.sessions] : data.sessions;
    sessions.value = [...new Map(merged.map((s) => [s.kind + s.id, s])).values()];
    cursor.value = data.nextCursor;
  } catch {
    if (ticket === revision) error.value = append ? 'more' : 'load';
  } finally {
    if (ticket === revision) loading.value = false;
  }
}
async function save() {
  if (!editing.value || saving.value) return;
  saving.value = true;
  error.value = '';
  const ticket = revision;
  try {
    await updateWorkspaceConversation(editing.value.id, {
      title: title.value,
      projectId: projectChoice.value || null
    });
    if (ticket !== revision) return;
    editing.value = null;
    await load(false);
  } catch {
    if (ticket === revision) error.value = 'save';
  } finally {
    saving.value = false;
  }
}
const refresh = () => {
  sessions.value = [];
  projects.value = [];
  editing.value = null;
  void load(false);
};
onMounted(() => {
  void load(false);
  window.addEventListener('app-auth-changed', refresh);
  window.addEventListener('workspace:navigation-changed', refresh);
});
onBeforeUnmount(() => {
  revision++;
  window.removeEventListener('app-auth-changed', refresh);
  window.removeEventListener('workspace:navigation-changed', refresh);
});
</script>
<style scoped>
.navigation-caption {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 8px 8px;
  color: var(--muted);
  font-size: 12px;
}
button,
a {
  color: inherit;
  font: inherit;
}
button {
  border: 0;
  background: transparent;
  cursor: pointer;
}
.navigation-caption a {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
}
.project-heading {
  display: flex;
  align-items: center;
  margin-top: 7px;
}
.project-heading > button:first-child {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 7px 5px;
  text-align: left;
}
.project-heading span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.project-heading > button:last-child {
  display: grid;
  place-items: center;
  width: 28px;
  height: 32px;
}
.project-sessions {
  padding-left: 16px;
}
.session-row {
  display: flex;
  border-radius: 7px;
  min-width: 0;
}
.session-row.selected {
  background: var(--surface-selected);
}
.session-row.selected a {
  color: var(--text);
  font-weight: 560;
}
.session-row a {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 9px 8px;
  text-decoration: none;
  font-size: 13px;
}
.session-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-row i {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: var(--muted);
}
.session-row i.running {
  background: var(--acid);
}
.session-row > button {
  width: 28px;
  display: grid;
  place-items: center;
  opacity: 0;
}
.session-row:hover > button,
.session-row:focus-within > button {
  opacity: 1;
}
.empty-project {
  display: block;
  color: var(--muted);
  padding: 7px 8px;
  font-size: 12px;
}
.load-more {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 32px;
  padding: 6px 8px;
  border-radius: 7px;
  color: var(--muted);
  font-size: 13px;
  line-height: 20px;
  text-align: left;
}
.load-more:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.load-more:disabled { opacity: 1; cursor: progress; }
.navigation-more-error { margin: 2px 0 0; line-height: 1.6; }
@media (hover: hover) and (pointer: fine) {
  .load-more:hover:not(:disabled) { color: var(--text); background: var(--surface-hover); }
}
.session-editor {
  display: grid;
  min-width: 0;
  gap: 12px;
  margin: 4px;
  padding: 12px;
  border-radius: 8px;
  background: var(--surface);
}
.session-editor h2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
}
.session-editor h2 .workspace-icon { color: var(--muted); }
.session-editor label {
  display: grid;
  min-width: 0;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
}
.session-editor input,
.session-editor select {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
}
.session-editor > div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.session-editor button {
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 20px;
}
.session-editor .session-cancel { color: var(--muted); }
.session-editor .session-save { color: var(--text); background: var(--surface-raised); font-weight: 500; }
.session-editor :is(input,select,button):focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.session-editor button:disabled { opacity: .5; cursor: progress; }
.session-save-error { margin: 0; color: var(--danger); font-size: 12px; line-height: 1.6; }
@media (hover: hover) and (pointer: fine) {
  .session-editor button:hover:not(:disabled) { color: var(--text); background: var(--surface-hover); }
}
.navigation-empty {
  margin: 8px 0;
  line-height: 1.6;
}
.project-navigation > p {
  color: var(--muted);
  font-size: 12px;
  padding: 8px;
}
@media (max-width: 799px), (pointer: coarse) {
  button,
  a,
  input,
  select {
    min-height: 44px;
  }
  .session-editor :is(input,select,button) { min-height: 44px; }
  .session-editor :is(input,select) { font-size: 16px; }
  .navigation-caption a,
  .project-heading > button:last-child {
    min-width: 44px;
  }
  .session-row > button {
    opacity: 1;
    min-width: 44px;
  }
}
</style>
