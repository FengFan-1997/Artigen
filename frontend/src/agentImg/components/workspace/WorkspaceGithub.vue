<template>
  <section class="github-workspace">
    <header>
      <WorkspaceIcon name="git" /><b>GitHub</b><span>{{ zh ? '只读' : 'Read only' }}</span
      ><button v-if="repository" @click="refresh">{{ zh ? '刷新' : 'Refresh' }}</button>
    </header>
    <p v-if="!projectId">
      {{ zh ? '先选择项目，再关联 GitHub 仓库。' : 'Choose a project to link a repository.' }}
    </p>
    <template v-else
      ><p v-if="notice" role="status">{{ notice }}</p>
      <template v-if="!repository"
        ><p>
          {{
            zh
              ? '查看项目的真实 PR、提交与文件差异。'
              : 'View real pull requests, commits and file changes.'
          }}
        </p>
        <button @click="connect">{{ zh ? '连接 GitHub 账号' : 'Connect GitHub' }}</button>
        <form @submit.prevent="bind">
          <label
            >{{ zh ? '仓库（owner/repository）' : 'Repository (owner/repository)'
            }}<input
              v-model="repositoryInput"
              placeholder="owner/repository"
              required
              :disabled="busy" /></label
          ><button :disabled="busy">{{ zh ? '关联仓库' : 'Link repository' }}</button>
        </form></template
      >
      <template v-else
        ><div class="repo-heading">
          <b>{{ repository.owner }}/{{ repository.repository }}</b
          ><button :disabled="busy" @click="unlink">{{ zh ? '解除关联' : 'Unlink' }}</button>
        </div>
        <div v-if="!selected" ref="recordList" class="github-records" :aria-busy="busy">
          <nav class="github-record-types" :aria-label="zh ? 'GitHub 记录类型' : 'GitHub record type'">
            <button type="button" :aria-pressed="kind === 'pulls'" @click="select('pulls')">{{ zh ? '拉取请求' : 'Pull requests' }}</button
            ><button type="button" :aria-pressed="kind === 'commits'" @click="select('commits')">
              {{ zh ? '提交' : 'Commits' }}
            </button>
          </nav>
          <p v-if="busy" role="status">{{ zh ? '正在读取…' : 'Loading…' }}</p>
          <p v-else-if="!items.length && !notice">{{ zh ? '暂无记录' : 'No records' }}</p>
          <button
            v-for="item in items"
            :key="item.sha || item.number"
            class="git-record"
            :data-record-key="item.sha || item.number"
            @click="inspect(item)"
          >
            <WorkspaceIcon name="git" /><span
              ><b :title="item.title">{{ item.title }}</b
              ><small
                >{{
                  item.number ? '#' + item.number + ' · ' + item.state : item.sha?.slice(0, 8)
                }}
                · {{ item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : '' }}</small
              ></span
            ></button
          ><button v-if="hasMore" :disabled="busy" @click="load(true)">
            {{ zh ? '加载更多' : 'Load more' }}
          </button>
        </div>
        <section v-if="selected">
          <header>
            <button ref="backButton" @click="returnToRecords">
              {{ zh ? '返回记录' : 'Back' }}</button
            ><a
              v-if="safeGithubUrl(selected.url)"
              :href="selected.url"
              target="_blank"
              rel="noopener noreferrer"
              >{{ zh ? '在 GitHub 打开' : 'Open on GitHub' }}</a
            >
          </header>
          <h3>{{ selected.title }}</h3>
          <details v-for="file in patches" :key="file.filename">
            <summary>
              {{ file.filename }} <span class="added">+{{ file.additions }}</span>
              <span class="removed">−{{ file.deletions }}</span>
            </summary>
            <pre>{{
              file.patch || (zh ? '此文件没有可用文本差异。' : 'No text patch is available.')
            }}</pre>
          </details>
          <button v-if="patchMore" :disabled="busy" @click="loadPatch(true)">
            {{ zh ? '加载更多文件' : 'Load more files' }}
          </button>
        </section>
      </template></template
    >
  </section>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import WorkspaceIcon from './WorkspaceIcon.vue';
import { workspaceRequest } from '../../services/workspace';
import { connectAgentIntegration } from '../../services/agentRuns';
type RecordItem = {
  number?: number;
  sha?: string;
  title: string;
  state?: string;
  url: string;
  updatedAt?: string;
};
type Patch = { filename: string; additions: number; deletions: number; patch: string | null };
const props = defineProps<{ projectId: string; zh: boolean }>();
const route = useRoute();
const repository = ref<{ owner: string; repository: string } | null>(null);
const repositoryInput = ref('');
const notice = ref('');
const busy = ref(false);
const kind = ref<'pulls' | 'commits'>('pulls');
const items = ref<RecordItem[]>([]);
const selected = ref<RecordItem | null>(null);
const patches = ref<Patch[]>([]);
const backButton = ref<HTMLButtonElement | null>(null);
const recordList = ref<HTMLElement | null>(null);
async function returnToRecords() {
  const item = selected.value;
  selected.value = null;
  patches.value = [];
  await nextTick();
  if (item)
    Array.from(recordList.value?.querySelectorAll<HTMLElement>('.git-record') || [])
      .find((node) => node.dataset.recordKey === String(item.sha || item.number))
      ?.focus();
}
const hasMore = ref(false);
const patchMore = ref(false);
let page = 1;
let patchPage = 1;
let revision = 0;
const endpoint = () => `/api/workspace/projects/${encodeURIComponent(props.projectId)}/github`;
const safeGithubUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com';
  } catch {
    return false;
  }
};
function errorText(error: unknown) {
  const text = String(error);
  if (text.includes('NOT_CONFIGURED'))
    return props.zh
      ? 'GitHub 授权尚未配置，请先完成服务端 OAuth 配置。'
      : 'GitHub OAuth is not configured.';
  if (text.includes('NOT_CONNECTED') || text.includes('EXPIRED'))
    return props.zh ? 'GitHub 授权不可用，请重新连接。' : 'Reconnect GitHub.';
  return props.zh
    ? '读取失败，可能没有权限或触发限流，请稍后重试。'
    : 'Request failed. Check access or retry later.';
}
async function refresh() {
  const ticket = ++revision;
  repository.value = null;
  items.value = [];
  selected.value = null;
  patches.value = [];
  notice.value = '';
  if (!props.projectId) {
    busy.value = false;
    return;
  }
  busy.value = true;
  try {
    const data = await workspaceRequest<{ repository: typeof repository.value }>(endpoint());
    if (ticket !== revision) return;
    repository.value = data.repository;
    if (data.repository) await load(false);
  } catch (e) {
    if (ticket === revision) notice.value = errorText(e);
  } finally {
    if (ticket === revision) busy.value = false;
  }
}
async function connect() {
  try {
    const auth = await connectAgentIntegration('github', route.fullPath);
    const url = new URL(auth.authorizeUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com')
      throw Error('INVALID_OAUTH_URL');
    location.assign(url.href);
  } catch (e) {
    notice.value = errorText(e);
  }
}
async function bind() {
  if (busy.value) return;
  const [owner, repo, ...extra] = repositoryInput.value.trim().split('/');
  if (!owner || !repo || extra.length) {
    notice.value = '请输入 owner/repository';
    return;
  }
  const ticket = ++revision;
  busy.value = true;
  try {
    const result = await workspaceRequest<{ repository: { owner: string; repository: string } }>(
      endpoint(),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repository: repo })
      }
    );
    if (ticket !== revision) return;
    repository.value = result.repository;
    await load(false);
  } catch (e) {
    if (ticket === revision) notice.value = errorText(e);
  } finally {
    if (ticket === revision) busy.value = false;
  }
}
async function unlink() {
  const ticket = ++revision;
  try {
    await workspaceRequest(endpoint(), { method: 'DELETE' });
    if (ticket === revision) {
      repository.value = null;
      items.value = [];
      selected.value = null;
    }
  } catch (e) {
    if (ticket === revision) notice.value = errorText(e);
  }
}
async function load(append = false) {
  const ticket = ++revision;
  const currentPage = append ? page + 1 : 1;
  busy.value = true;
  notice.value = '';
  try {
    const result = await workspaceRequest<{ items: RecordItem[]; hasMore: boolean }>(
      endpoint() + `/${kind.value}?page=${currentPage}`
    );
    if (ticket !== revision) return;
    items.value = append ? [...items.value, ...result.items] : result.items;
    page = currentPage;
    hasMore.value = result.hasMore;
  } catch (e) {
    if (ticket === revision) notice.value = errorText(e);
  } finally {
    if (ticket === revision) busy.value = false;
  }
}
const select = (next: 'pulls' | 'commits') => {
  if (kind.value === next) return;
  kind.value = next;
  items.value = [];
  hasMore.value = false;
  selected.value = null;
  patches.value = [];
  void load(false);
};
const inspect = (item: RecordItem) => {
  selected.value = item;
  patches.value = [];
  void loadPatch(false);
  void nextTick(() => backButton.value?.focus());
};
async function loadPatch(append = false) {
  if (!selected.value) return;
  const ticket = ++revision;
  busy.value = true;
  const current = append ? patchPage + 1 : 1;
  const query = selected.value.number
    ? `pull-files?number=${selected.value.number}`
    : `commit?sha=${selected.value.sha}`;
  try {
    const result = await workspaceRequest<{ items: Patch[]; hasMore: boolean }>(
      endpoint() + `/${query}&page=${current}`
    );
    if (ticket !== revision) return;
    patches.value = append ? [...patches.value, ...result.items] : result.items;
    patchPage = current;
    patchMore.value = result.hasMore;
  } catch (e) {
    if (ticket === revision) notice.value = errorText(e);
  } finally {
    if (ticket === revision) busy.value = false;
  }
}
watch(
  () => props.projectId,
  () => {
    busy.value = false;
    void refresh();
  },
  { immediate: true }
);
onBeforeUnmount(() => revision++);
</script>
<style scoped>
.github-workspace {
  overflow: auto;
  padding: 18px;
  height: 100%;
  font-size: 13px;
}
.github-workspace header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.github-workspace header > span {
  color: var(--muted);
  margin-left: auto;
}
.github-workspace p {
  color: var(--muted);
  line-height: 1.7;
}
.github-workspace button {
  border: 0;
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  padding: 8px 10px;
  font: inherit;
  cursor: pointer;
}
.github-workspace form {
  display: grid;
  gap: 10px;
  margin: 20px 0;
}
.github-workspace label {
  display: grid;
  gap: 6px;
}
.github-workspace input {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 9px;
  color: var(--text);
  background: var(--bg);
  font: inherit;
}
.repo-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 18px 0;
  gap: 8px;
  overflow-wrap: anywhere;
}
.github-record-types {
  display: flex;
  width: max-content;
  max-width: 100%;
  gap: 2px;
  margin: 16px 0;
  padding: 3px;
  border-radius: 8px;
  background: var(--surface-raised);
}
.github-record-types button {
  min-width: 0;
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  font-size: 13px;
  line-height: 20px;
}
.github-record-types button[aria-pressed='true'] {
  color: var(--text);
  background: var(--surface);
  font-weight: 500;
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}
.github-record-types button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .github-record-types button:hover { color: var(--text); }
}
.github-workspace .git-record {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  width: 100%;
  text-align: left;
  gap: 10px;
  align-items: start;
  margin: 2px 0;
  padding: 10px;
  background: transparent;
}
.github-workspace .git-record:hover,
.github-workspace .git-record:focus-visible {
  background: var(--surface-hover);
}
.git-record > .workspace-icon {
  margin-top: 2px;
  color: var(--muted);
}
.git-record span {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.git-record b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 550;
  line-height: 20px;
}
.git-record small {
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
}
a {
  color: var(--acid-text);
}
details {
  padding: 12px 0;
}
summary {
  cursor: pointer;
  overflow-wrap: anywhere;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    12px/1.7 ui-monospace,
    monospace;
}
.added {
  color: var(--success);
}
.removed {
  color: var(--danger);
}
@media (max-width: 799px), (pointer: coarse) {
  .github-record-types button { min-height: 44px; }
  input {
    min-height: 44px;
    font-size: 16px;
  }
  button {
    min-height: 44px;
  }
}
</style>
