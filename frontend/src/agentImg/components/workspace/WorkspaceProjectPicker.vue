<template>
  <section class="project-picker" :aria-label="zh ? 'GitHub 项目范围' : 'GitHub project scope'">
    <label :for="selectId">{{ zh ? '查看项目' : 'View project' }}</label>
    <div class="project-picker-row">
      <select :id="selectId" :value="viewedProjectId" :disabled="loading || busy" @change="choose(($event.target as HTMLSelectElement).value)">
        <option value="">{{ loading ? (zh ? '正在读取项目…' : 'Loading projects…') : (zh ? '选择项目' : 'Choose a project') }}</option>
        <option v-for="project in projects" :key="project.projectId" :value="project.projectId">{{ project.title }}</option>
      </select>
      <button type="button" :aria-expanded="creating" :disabled="busy" @click="openCreate">{{ zh ? '新建项目' : 'New project' }}</button>
    </div>
    <p class="project-scope-note">{{ zh ? '切换这里的项目只影响 GitHub 查看范围。' : 'This selection only changes the project shown in GitHub.' }}</p>
    <p v-if="!loading && !projects.length && !listError" class="project-scope-note">{{ zh ? '还没有项目，可以在这里新建。' : 'No projects yet. Create one here.' }}</p>
    <div v-if="listError" class="project-error" role="status"><span>{{ zh ? '项目读取失败。' : 'Could not load projects.' }}</span><button type="button" @click="loadProjects">{{ zh ? '重试' : 'Retry' }}</button></div>
    <form v-if="creating" class="create-project-form" @submit.prevent="create">
      <label :for="nameId">{{ zh ? '项目名称' : 'Project name' }}</label>
      <input :id="nameId" ref="nameInput" v-model="title" name="project-title" maxlength="160" required :disabled="busy" />
      <div class="project-actions"><button type="submit" :disabled="busy || !title.trim()">{{ busy ? (zh ? '正在创建…' : 'Creating…') : (zh ? '创建并查看' : 'Create and view') }}</button><button type="button" :disabled="busy" @click="creating = false">{{ zh ? '取消' : 'Cancel' }}</button></div>
    </form>
    <template v-if="runId && !projectId && viewedProjectId">
      <button v-if="!associationScope" type="button" class="associate-project" :disabled="busy" @click="prepareAssociation">{{ busy ? (zh ? '正在检查任务…' : 'Checking task…') : (zh ? '将当前任务关联到此项目' : 'Link this task to this project') }}</button>
      <section v-else class="association-confirm" :aria-label="zh ? '确认项目关联' : 'Confirm project link'">
        <p>{{ associationScope.scope === 'conversation'
          ? (zh ? `这会将整个会话及其 ${associationScope.affectedRunCount} 个任务关联到“${selectedTitle}”，后续任务也使用此项目。` : `This links the whole conversation and its ${associationScope.affectedRunCount} tasks to “${selectedTitle}”. Future tasks will use this project.`)
          : (zh ? `将当前任务关联到“${selectedTitle}”。关联后不能在这里更换项目。` : `Link this task to “${selectedTitle}”. Its project cannot be changed here afterward.`) }}</p>
        <p v-if="associationScope.requiresPausedConfirmation">{{ zh ? '关联后保持暂停；需要时请手动继续。' : 'The task stays paused after linking. Resume it when ready.' }}</p>
        <p v-if="associationScope.blockedReason" role="status">{{ projectAssociationError(associationScope.blockedReason, zh) }}</p>
        <div class="project-actions"><button v-if="associationScope.pausableRunIds?.length" type="button" :disabled="busy || pausePending" @click="pauseTasks">{{ pausePending ? (zh ? '正在安全暂停…' : 'Pausing safely…') : (zh ? '暂停相关任务' : 'Pause related tasks') }}</button><button v-if="!associationScope.blockedReason && !associationScope.projectId" type="button" :disabled="busy" @click="associate">{{ busy ? (zh ? '正在关联…' : 'Linking…') : (zh ? '确认关联' : 'Confirm link') }}</button><button v-else type="button" :disabled="busy" @click="prepareAssociation">{{ zh ? '刷新任务状态' : 'Refresh task state' }}</button><button type="button" :disabled="busy" @click="cancelAssociation">{{ zh ? '取消' : 'Cancel' }}</button></div>
      </section>
    </template>
    <p v-if="notice" class="project-error" role="status">{{ notice }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { controlAgentRun } from '../../services/agentRuns';
import { getCurrentUserId } from '@/login/session';
import { createCreativeProject, listCreativeProjects, type CreativeProject } from '../../services/creativeProjects';
import { associateAgentProject, getAgentProjectScope, projectAssociationError, type AgentProjectScope } from '../../services/agentProjectAssociation';
const props = withDefaults(defineProps<{ projectId?: string | null; viewedProjectId: string; runId?: string; runStatus?: string; zh: boolean }>(), { projectId: '', runId: '', runStatus: '' });
const emit = defineEmits<{ 'view-project': [projectId: string]; 'project-associated': [value: { projectId: string; scope: 'run' | 'conversation'; affectedRunCount: number }] }>();
const selectId = useId(), nameId = useId();
const nameInput = ref<HTMLInputElement | null>(null);
const projects = ref<CreativeProject[]>([]), loading = ref(false), listError = ref(false), busy = ref(false), creating = ref(false), title = ref(''), notice = ref('');
const associationScope = ref<AgentProjectScope | null>(null);
const selectedTitle = computed(() => projects.value.find((project) => project.projectId === props.viewedProjectId)?.title || (props.zh ? '所选项目' : 'Selected project'));
const pausePending = ref(false);
let pauseTimer: ReturnType<typeof setTimeout> | null = null;
let revision = 0;
const cancelPauseRefresh = () => { if (pauseTimer) clearTimeout(pauseTimer); pauseTimer = null; pausePending.value = false; };
let listRevision = 0;
const current = () => `${getCurrentUserId()}:${props.runId}`;
const choose = (projectId: string) => { cancelPauseRefresh(); revision++; busy.value = false; notice.value = ''; associationScope.value = null; emit('view-project', projectId); };
async function loadProjects() {
  const ticket = ++listRevision, owner = getCurrentUserId();
  loading.value = true; listError.value = false;
  try {
    const result = await listCreativeProjects();
    if (ticket !== listRevision || owner !== getCurrentUserId()) return;
    projects.value = result.filter((project) => project.status === 'active');
  } catch { if (ticket === listRevision && owner === getCurrentUserId()) listError.value = true; }
  finally { if (ticket === listRevision && owner === getCurrentUserId()) loading.value = false; }
}
async function openCreate() { creating.value = !creating.value; notice.value = ''; await nextTick(); if (creating.value) nameInput.value?.focus(); }
async function create() {
  if (busy.value || !title.value.trim()) return;
  const ticket = ++revision, identity = current(); busy.value = true; notice.value = '';
  try {
    const project = await createCreativeProject({ title: title.value.trim() });
    if (ticket !== revision || identity !== current()) return;
    projects.value = [project, ...projects.value.filter((item) => item.projectId !== project.projectId)];
    creating.value = false; title.value = ''; emit('view-project', project.projectId);
    window.dispatchEvent(new Event('workspace:navigation-changed'));
  } catch (error) { if (ticket === revision && identity === current()) notice.value = projectAssociationError(error, props.zh); }
  finally { if (ticket === revision && identity === current()) busy.value = false; }
}
const cancelAssociation = () => { cancelPauseRefresh(); revision++; associationScope.value = null; busy.value = false; };
async function prepareAssociation() {
  if (busy.value || !props.runId) return;
  cancelPauseRefresh();
  const ticket = ++revision, identity = current(); busy.value = true; notice.value = '';
  try {
    const scope = await getAgentProjectScope(props.runId);
    if (ticket !== revision || identity !== current()) return;
    associationScope.value = scope;
    if (scope.projectId) notice.value = props.zh ? '任务归属已变化，请重新打开当前任务。' : 'The task project changed. Reopen this task.';
  } catch (error) { if (ticket === revision && identity === current()) notice.value = projectAssociationError(error, props.zh); }
  finally { if (ticket === revision && identity === current()) busy.value = false; }
}
async function pauseTasks() {
  const ids = associationScope.value?.pausableRunIds || [];
  if (busy.value || pausePending.value || !ids.length) return;
  const ticket = ++revision, identity = current();
  pausePending.value = true; notice.value = '';
  try {
    const results = await Promise.allSettled(ids.map((id) => controlAgentRun(id, 'pause')));
    if (ticket !== revision || identity !== current()) return;
    if (results.some((item) => item.status === 'rejected')) {
      notice.value = props.zh ? '部分任务未能暂停，请刷新状态后重试。' : 'Some tasks could not pause. Refresh and retry.';
      cancelPauseRefresh();
    }
    let attempts = 0;
    const refresh = async () => {
      if (ticket !== revision || identity !== current()) return;
      try {
        const scope = await getAgentProjectScope(props.runId);
        if (ticket !== revision || identity !== current()) return;
        associationScope.value = scope;
        if (scope.requiresPause && pausePending.value && ++attempts < 30) pauseTimer = setTimeout(() => void refresh(), 1500);
        else cancelPauseRefresh();
      } catch (error) {
        if (ticket === revision && identity === current()) { notice.value = projectAssociationError(error, props.zh); cancelPauseRefresh(); }
      }
    };
    await refresh();
  } catch (error) { if (ticket === revision && identity === current()) { notice.value = projectAssociationError(error, props.zh); cancelPauseRefresh(); } }
}
async function associate() {
  if (busy.value || !associationScope.value || associationScope.value.blockedReason) return;
  const ticket = ++revision, identity = current(); busy.value = true; notice.value = '';
  try {
    const scope = await associateAgentProject(props.runId, props.viewedProjectId, associationScope.value);
    if (ticket !== revision || identity !== current()) return;
    associationScope.value = null;
    emit('project-associated', { projectId: scope.projectId!, scope: scope.scope, affectedRunCount: scope.affectedRunCount });
    window.dispatchEvent(new Event('workspace:navigation-changed'));
    notice.value = props.zh ? '已关联项目。' : 'Project linked.';
  } catch (error) { if (ticket === revision && identity === current()) { associationScope.value = null; notice.value = projectAssociationError(error, props.zh); } }
  finally { if (ticket === revision && identity === current()) busy.value = false; }
}
watch(() => [props.runId, props.projectId, props.viewedProjectId], () => { cancelPauseRefresh(); revision++; busy.value = false; associationScope.value = null; notice.value = ''; });
const reset = () => { cancelPauseRefresh(); revision++; listRevision++; busy.value = false; projects.value = []; associationScope.value = null; creating.value = false; notice.value = ''; void loadProjects(); };
onMounted(() => { void loadProjects(); window.addEventListener('app-auth-changed', reset); });
onBeforeUnmount(() => { cancelPauseRefresh(); revision++; listRevision++; window.removeEventListener('app-auth-changed', reset); });
</script>
<style scoped>
.project-picker { flex:none; padding:16px 18px 12px; border-bottom:1px solid var(--border); font-size:13px; }
.project-picker label { display:block; margin-bottom:8px; color:var(--text); font-weight:600; }
.project-picker-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.project-picker select,.project-picker input { min-width:0; width:100%; min-height:38px; padding:8px 12px; border:1px solid var(--control-border); border-radius:7px; background:var(--surface); color:var(--text); font:inherit; }
.project-picker select { flex:1 1 160px; }
.project-picker button { min-height:36px; border:0; border-radius:7px; padding:8px 12px; background:var(--surface-raised); color:var(--text); font:inherit; cursor:pointer; }
.project-picker button:hover:not(:disabled) { background:var(--surface-hover); }
.project-picker button:disabled { opacity:.55; cursor:default; }
.project-scope-note,.project-error,.association-confirm p { margin:8px 0 0; line-height:1.6; color:var(--muted); }
.project-error { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.create-project-form,.association-confirm { margin-top:14px; }
.project-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
.associate-project { margin-top:12px; }
.project-picker :is(button,select,input):focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
@media (pointer:coarse) { .project-picker :is(button,select,input) { min-height:44px; } .project-picker :is(select,input) { font-size:16px; } }
</style>
