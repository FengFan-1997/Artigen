<template>
  <div
    ref="resourceRoot"
    class="resource-workspace"
    :class="{ 'tree-hidden': !treeVisible, 'compact-tree': compact }"
  >
    <WorkspaceGithub
      :key="scope()"
      v-if="mode === 'github'"
      :project-id="projectId || ''"
      :zh="zh"
    />
    <template v-else>
      <div class="file-tabs" role="tablist" :aria-label="zh ? '已打开文件' : 'Open files'">
        <div
          v-for="doc in documents"
          :key="doc.key"
          class="file-tab"
          :class="{ active: activeKey === doc.key }"
        >
          <button role="tab" :aria-selected="activeKey === doc.key" @click="activeKey = doc.key">
            <WorkspaceIcon
              :name="doc.file.mimeType.startsWith('image/') ? 'image' : 'file'"
              :size="14"
            /><span>{{ filename(doc.file.path) }}{{ dirty(doc) ? ' •' : '' }}</span></button
          ><button
            :aria-label="
              zh ? `关闭 ${filename(doc.file.path)}` : `Close ${filename(doc.file.path)}`
            "
            @click="closeDocument(doc)"
          >
            <WorkspaceIcon name="close" :size="14" />
          </button>
        </div>
        <button
          class="tree-toggle"
          :aria-label="
            treeVisible
              ? zh
                ? '隐藏目录树'
                : 'Hide file tree'
              : zh
                ? '显示目录树'
                : 'Show file tree'
          "
          :aria-pressed="treeVisible"
          @click="toggleTree"
        >
          <WorkspaceIcon name="panel-right" />
        </button>
      </div>
      <p v-if="notice" class="resource-notice" role="status">{{ notice }}</p>
      <div class="file-body">
        <section class="file-viewer">
          <div v-if="active" class="file-toolbar">
            <span class="breadcrumb" :title="active.file.path"
              >{{ active.source === 'local' ? (zh ? '本机' : 'Local') : zh ? '项目' : 'Project' }} /
              {{ active.file.path }}</span
            >
            <div class="viewer-actions">
              <button
                v-if="active.text !== undefined"
                :aria-pressed="active.view === 'preview'"
                @click="active.view = 'preview'"
              >
                {{ zh ? '预览' : 'Preview' }}</button
              ><button
                v-if="active.text !== undefined"
                :aria-pressed="active.view === 'source'"
                @click="active.view = 'source'"
              >
                {{ zh ? '源码' : 'Source' }}</button
              ><button
                v-if="active.text !== undefined"
                :disabled="!canSave(active) || saving"
                @click="save(active)"
              >
                {{ saving ? (zh ? '保存中…' : 'Saving…') : zh ? '保存' : 'Save' }}</button
              ><button v-if="active.blob" @click="download(active)">
                <WorkspaceIcon name="download" />
              </button>
            </div>
          </div>
          <div v-if="mode === 'changes'" class="changes-panel">
            <template v-if="active?.text !== undefined"
              ><header>
                <b>{{ filename(active.file.path) }}</b
                ><span class="added">+{{ statistics.added }}</span
                ><span class="removed">−{{ statistics.removed }}</span>
              </header>
              <p>
                {{
                  proposal
                    ? zh
                      ? 'Agent 候选修改，尚未写入文件。'
                      : 'Agent proposal; not yet applied.'
                    : zh
                      ? '当前编辑与打开时版本的差异。'
                      : 'Current edits compared with the opened version.'
                }}
              </p>
              <label v-if="candidateFiles.length"
                >{{ zh ? '选择 Agent 候选文件' : 'Choose an Agent candidate'
                }}<select
                  :value="proposal?.candidateId || ''"
                  @change="chooseProposal(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ zh ? '当前编辑' : 'Current edits' }}</option>
                  <option v-for="file in candidateFiles" :key="file.id" :value="file.id">
                    {{ file.path }}
                  </option>
                </select></label
              >
              <div class="change-actions">
                <button v-if="proposal" :disabled="saving" @click="applyProposal">
                  {{ zh ? '应用到当前文件' : 'Apply to current file' }}</button
                ><button v-if="active.undo !== undefined" :disabled="saving" @click="undoApply">
                  {{ zh ? '撤销最近一次应用' : 'Undo last application' }}</button
                ><button v-if="!proposal && dirty(active)" :disabled="saving" @click="save(active)">
                  {{ zh ? '保存当前修改' : 'Save changes' }}
                </button>
              </div>
              <WorkspaceEditor
                :key="active.key + ':diff:' + String(proposal?.candidateId || '')"
                :model-value="proposal?.text ?? active.text"
                :compare-to="active.baseline"
                :path="active.file.path"
                :readonly="true"
                :label="zh ? '文件差异' : 'File differences'"
              />
            </template>
            <div v-else class="resource-empty">
              <WorkspaceIcon name="git" :size="20" />
              <h2>{{ zh ? '先打开一个文本文件' : 'Open a text file' }}</h2>
              <p>
                {{
                  zh
                    ? '这里显示编辑、Agent 候选与版本差异；GitHub 记录在独立面板中。'
                    : 'Inspect edits and Agent proposals here. GitHub history is in its own panel.'
                }}
              </p>
            </div>
          </div>
          <template v-else-if="active">
            <p v-if="active.loading" class="resource-loading" role="status">
              {{ zh ? '正在读取文件…' : 'Opening file…' }}
            </p>
            <div v-else-if="active.error" class="resource-empty">
              <p role="alert">{{ active.error }}</p>
              <button @click="reloadDocument(active)">{{ zh ? '重试' : 'Retry' }}</button>
            </div>
            <WorkspaceEditor
              v-else-if="active.text !== undefined && active.view === 'source'"
              :key="active.key"
              :model-value="active.text"
              :path="active.file.path"
              :readonly="!editable(active)"
              @update:model-value="edit(active!, $event)"
              @save="save(active!)"
            />
            <div
              v-else-if="
                /^image\/(png|jpeg|webp|gif)$/.test(active.file.mimeType) && active.objectUrl
              "
              class="image-viewer"
            >
              <div>
                <button
                  :aria-label="zh ? '缩小图片' : 'Zoom out'"
                  @click="zoom = Math.max(0.25, zoom - 0.25)"
                >
                  −</button
                ><button @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button
                ><button
                  :aria-label="zh ? '放大图片' : 'Zoom in'"
                  @click="zoom = Math.min(4, zoom + 0.25)"
                >
                  +
                </button>
              </div>
              <img
                :src="active.objectUrl"
                :alt="filename(active.file.path)"
                :style="{ width: 100 * zoom + '%', maxWidth: zoom === 1 ? '100%' : 'none' }"
              />
            </div>
            <WorkspacePdf
              v-else-if="active.file.mimeType === 'application/pdf' && active.blob"
              :key="active.key"
              :blob="active.blob"
            />
            <div
              v-else-if="active.text !== undefined && /\.(md|markdown)$/i.test(active.file.path)"
              class="document-preview"
            >
              <WorkspaceMarkdown :text="active.text" :files="files" />
            </div>
            <iframe
              v-else-if="active.text !== undefined && /\.html?$/i.test(active.file.path)"
              class="html-preview"
              :srcdoc="staticHtml(active.text)"
              sandbox=""
              referrerpolicy="no-referrer"
              :title="filename(active.file.path)"
            ></iframe>
            <pre v-else-if="active.text !== undefined" class="text-preview">{{ active.text }}</pre>
            <div v-else class="resource-empty">
              <WorkspaceIcon name="file" :size="20" />
              <h2>{{ filename(active.file.path) }}</h2>
              <p>{{ active.file.mimeType }} · {{ formatSize(active.file.byteSize) }}</p>
              <button v-if="active.blob" @click="download(active)">
                {{ zh ? '下载后打开' : 'Download to open' }}
              </button>
            </div>
            <footer v-if="!active.loading" class="file-status">
              <span
                >{{ dirty(active) ? (zh ? '未保存' : 'Unsaved') : zh ? '已保存' : 'Saved' }} ·
                {{ active.source === 'local' ? '本机' : `v${active.file.revision}` }}</span
              ><button :disabled="!active.blob || dirty(active) || saving" @click="attach(active)">
                {{ zh ? '加入会话上下文' : 'Add to chat context' }}</button
              ><button v-if="active.text !== undefined" @click="$emit('changes')">
                {{ zh ? '查看变更' : 'View changes' }}</button
              ><select
                v-if="versions.length"
                aria-label="查看文件版本"
                @change="
                  ($event.target as HTMLSelectElement).value !== '' &&
                  compareVersion(Number(($event.target as HTMLSelectElement).value))
                "
              >
                <option value="">{{ zh ? '历史版本' : 'Versions' }}</option>
                <option
                  v-for="version in versions"
                  :key="version.revision"
                  :value="version.revision"
                >
                  v{{ version.revision }}
                </option>
              </select>
            </footer>
          </template>
          <div v-else class="resource-empty">
            <WorkspaceIcon name="file" :size="20" />
            <h2>{{ zh ? '打开文件，继续工作' : 'Open a file to continue' }}</h2>
            <p>
              {{
                zh
                  ? '从目录选择项目产物，或连接本机文件夹。'
                  : 'Choose a project file or connect a local folder.'
              }}
            </p>
            <button v-if="!treeVisible" @click="toggleTree">
              {{ zh ? '显示目录' : 'Show files' }}</button
            ><button v-if="projectId" @click="newTextFile">
              {{ zh ? '新建文本文件' : 'New text file' }}</button
            ><button v-if="supportsLocalDirectories()" @click="connectFolder">
              {{ zh ? '连接本机文件夹' : 'Connect local folder' }}
            </button>
          </div>
        </section>
        <aside
          v-show="treeVisible"
          class="resource-tree"
          :aria-label="zh ? '文件目录' : 'File explorer'"
        >
          <label class="file-search"
            ><WorkspaceIcon name="search" /><input
              v-model="search"
              :placeholder="zh ? '筛选已加载文件…' : 'Filter loaded files…'"
              :aria-label="zh ? '筛选文件' : 'Filter files'"
          /></label>
          <div class="tree-section-heading">
            <span>{{ zh ? '项目文件' : 'Project files' }}</span
            ><button
              :aria-label="zh ? '刷新项目文件' : 'Refresh project files'"
              @click="refreshFiles"
            >
              <WorkspaceIcon name="refresh" :size="14" /></button
            ><button
              v-if="projectId"
              :aria-label="zh ? '新建文本文件' : 'New text file'"
              @click="newTextFile"
            >
              <WorkspaceIcon name="plus" :size="14" />
            </button>
          </div>
          <WorkspaceFileTree :nodes="projectNodes" :active="active?.file.id" @open="openNode" />
          <p v-if="!files.length">{{ zh ? '暂无文件' : 'No files yet' }}</p>
          <div class="tree-section-heading">
            <span>{{ zh ? '本机文件' : 'Local files' }}</span
            ><button
              :disabled="connecting"
              :aria-label="zh ? '连接本机文件夹' : 'Connect local folder'"
              @click="connectFolder"
            >
              <WorkspaceIcon name="plus" :size="14" />
            </button>
          </div>
          <template v-if="root"
            ><div class="local-root">
              <b>{{ root.name }}</b
              ><button @click="disconnectFolder">{{ zh ? '断开' : 'Disconnect' }}</button>
            </div>
            <button v-if="!permission" @click="reauthorize">
              {{ zh ? '重新授权目录' : 'Authorize folder again' }}</button
            ><WorkspaceFileTree
              v-else
              :key="localRootRevision"
              :nodes="localNodes"
              :read-directory="readLocalDirectory"
              :active="active?.file.id"
              @open="openNode"
          /></template>
          <p v-else>
            {{
              supportsLocalDirectories()
                ? zh
                  ? '选择目录后仅在本机读取。'
                  : 'A selected folder stays local.'
                : zh
                  ? '此浏览器不支持目录读写，请使用 Chrome。'
                  : 'Use Chrome for local folder access.'
            }}
          </p>
        </aside>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import {
  computed,
  reactive,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
import {
  isNavigationFailure,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter
} from 'vue-router';
import { getCurrentUserId } from '@/login/session';
import { authFetch } from '@/login/authFetch';
import { buildApiUrl } from '@/utils/api';
import WorkspaceIcon from './WorkspaceIcon.vue';
import WorkspaceFileTree from './WorkspaceFileTree.vue';
import WorkspaceGithub from './WorkspaceGithub.vue';
const WorkspaceMarkdown = defineAsyncComponent(() => import('./WorkspaceMarkdown.vue'));
import type { AgentArtifact } from '../../services/agentRuns';
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  saveWorkspaceFile,
  getWorkspaceVersions,
  type WorkspaceFile,
  type WorkspaceFileRef
} from '../../services/workspaceFiles';
import {
  chooseLocalRoot,
  localRootIdentity,
  restoreLocalRoot,
  disconnectLocalRoot,
  verifyLocalPermission,
  contentHash,
  writeLocalText,
  supportsLocalDirectories,
  sensitiveFile,
  saveEditorDraft,
  loadEditorDraft,
  clearEditorDraft,
  MAX_TEXT_BYTES,
  type LocalDirectory,
  type LocalFile
} from '../../services/localWorkspace';
import { staticFileHtml } from '../../services/workspacePreview';
import {
  stageWorkspaceAttachment,
  takeWorkspaceAttachment,
  type WorkspaceAttachment
} from '../../services/workspaceAttachmentTransfer';
import { cloudTree, readLocalDirectory, type TreeNode } from '../../services/workspaceTree';
const WorkspaceEditor = defineAsyncComponent(() => import('./WorkspaceEditor.vue'));
const WorkspacePdf = defineAsyncComponent(() => import('./WorkspacePdf.vue'));
const props = withDefaults(
  defineProps<{
    mode: 'files' | 'changes' | 'github' | 'task';
    projectId?: string | null;
    artifacts: AgentArtifact[];
    zh: boolean;
  }>(),
  { projectId: '' }
);
const emit = defineEmits<{ changes: [] }>();
type Document = {
  key: string;
  generation: number;
  owner: string;
  scope: string;
  file: WorkspaceFile;
  source: 'local' | 'cloud' | 'artifact';
  handle?: LocalFile;
  text?: string;
  baseline: string;
  baselineHash: string;
  blob?: Blob;
  objectUrl?: string;
  view: 'preview' | 'source';
  loading: boolean;
  error: string;
  undo?: string;
  draftTimer?: ReturnType<typeof setTimeout>;
};
const owner = ref(getCurrentUserId());
const files = ref<WorkspaceFile[]>([]);
const documents = ref<Document[]>([]);
const activeKey = ref('');
const notice = ref('');
const saving = ref(false);
const connecting = ref(false);
const root = ref<LocalDirectory | null>(null);
const rootIdentity = ref('');
const permission = ref(false);
const localNodes = ref<TreeNode[]>([]);
const localRootRevision = ref(0);
const search = ref('');
const treeVisible = ref(true);
const zoom = ref(1);
const versions = ref<Array<{ revision: number; createdAt: string; sha256: string }>>([]);
const proposal = ref<{ text: string; candidateId: string; baseHash: string } | null>(null);
const statistics = ref({ added: 0, removed: 0 });
let revision = 0;
let openRevision = 0;
let disposed = false;
const router = useRouter();
const route = useRoute();
const resourceRoot = ref<HTMLElement | null>(null);
const compact = ref(false);
let observer: ResizeObserver | null = null;
const project = computed(() => props.projectId || '');
const scope = () => JSON.stringify([owner.value, project.value]);
const active = computed(() => documents.value.find((d) => d.key === activeKey.value));
const projectNodes = computed(() =>
  cloudTree(files.value.filter((f) => f.path.toLowerCase().includes(search.value.toLowerCase())))
);
const candidateFiles = computed(() =>
  files.value.filter(
    (f) =>
      Boolean(f.originArtifactId) &&
      f.id !== active.value?.file.id &&
      f.byteSize <= MAX_TEXT_BYTES &&
      (/^text\//.test(f.mimeType) || /\.(md|txt|json|html|css|js|ts|csv)$/i.test(f.path))
  )
);
const dirty = (doc: Document) => doc.text !== undefined && doc.text !== doc.baseline;
const editable = (doc: Document) =>
  doc.text !== undefined && (doc.source === 'local' || Boolean(project.value));
const canSave = (doc: Document) => editable(doc) && dirty(doc);
const filename = (path: string) => path.split('/').at(-1) || path;
const formatSize = (bytes: number) =>
  bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const errorText = (error: unknown) => {
  const code = String(error);
  if (code.includes('CONFLICT'))
    return props.zh
      ? '文件已在其他位置修改。请重新读取并比较，未保存内容仍保留。'
      : 'File changed elsewhere. Reload and compare; your edits are kept.';
  if (code.includes('PERMISSION') || code.includes('NotAllowed'))
    return props.zh ? '没有文件写入权限，请重新授权后重试。' : 'Authorize file access and retry.';
  if (code.includes('TOO_LARGE'))
    return props.zh
      ? '文件超过读取或编辑限制，请下载后打开。'
      : 'This file exceeds the preview or editor limit.';
  if (code.includes('QUOTA'))
    return props.zh
      ? '本机草稿空间不足，此次修改暂时不能自动恢复，请及时保存。'
      : 'Draft storage is full; save your edits now.';
  return props.zh
    ? '操作未完成，请检查权限或网络后重试。'
    : 'Could not finish. Check access or network and retry.';
};
const staticHtml = staticFileHtml;
async function refreshFiles() {
  const ticket = revision;
  const current = scope();
  try {
    const remote = project.value ? (await listWorkspaceFiles(project.value)).files : [];
    if (ticket !== revision || scope() !== current) return;
    const generated = props.artifacts
      .filter((a) => a.assetId && a.url && a.verificationStatus === 'passed')
      .map((a) => ({
        id: 'artifact:' + a.artifactId,
        path: a.filename,
        revision: a.version,
        assetId: a.assetId!,
        mimeType: a.mimeType,
        byteSize: a.byteSize,
        sha256: a.sha256 || '',
        url: a.url!,
        originArtifactId: a.artifactId,
        verificationStatus: a.verificationStatus,
        editTarget: a.verification?.editTarget as WorkspaceFile['editTarget']
      }));
    files.value = [
      ...remote,
      ...generated.filter((a) => !remote.some((f) => f.assetId === a.assetId))
    ];
  } catch (error) {
    if (ticket === revision) notice.value = errorText(error);
  }
}
async function reset() {
  revision++;
  openRevision++;
  const current = scope();
  documents.value.forEach((doc) => {
    void flushDraft(doc);
    disposeDocument(doc);
  });
  documents.value = [];
  activeKey.value = '';
  root.value = null;
  permission.value = false;
  localNodes.value = [];
  files.value = [];
  proposal.value = null;
  versions.value = [];
  notice.value = '';
  saving.value = false;
  connecting.value = false;
  void refreshFiles();
  try {
    const handle = await restoreLocalRoot(owner.value, project.value);
    if (scope() !== current || disposed) return;
    const identity = await localRootIdentity(owner.value, project.value);
    if (scope() !== current || disposed) return;
    rootIdentity.value = identity;
    root.value = handle;
    if (handle) {
      const granted = await verifyLocalPermission(handle);
      if (scope() !== current || disposed) return;
      permission.value = granted;
      if (permission.value) await readRoot();
    }
  } catch {
    /* Browser storage may be unavailable. Cloud files still work. */
  }
}
function disposeDocument(doc: Document) {
  doc.generation++;
  if (doc.objectUrl) URL.revokeObjectURL(doc.objectUrl);
  if (doc.draftTimer) clearTimeout(doc.draftTimer);
}
async function readRoot() {
  if (!root.value) return;
  const ticket = revision;
  const nodes = await readLocalDirectory({
    id: 'local-root',
    name: root.value.name,
    path: '',
    directory: true,
    handle: root.value
  });
  if (ticket === revision) {
    localNodes.value = nodes;
    localRootRevision.value++;
  }
}
async function connectFolder() {
  if (connecting.value) return;
  if (
    documents.value.some((d) => d.source === 'local' && dirty(d)) &&
    !confirm(props.zh ? '更换目录前将保留本机草稿，继续吗？' : 'Keep drafts and switch folder?')
  )
    return;
  const ticket = revision;
  const current = scope();
  connecting.value = true;
  try {
    const handle = await chooseLocalRoot(owner.value, project.value);
    if (ticket !== revision || scope() !== current) return;
    await Promise.all(documents.value.filter((d) => d.source === 'local').map(flushDraft));
    const identity = await localRootIdentity(owner.value, project.value);
    if (ticket !== revision || scope() !== current) return;
    documents.value.filter((d) => d.source === 'local').forEach(disposeDocument);
    documents.value = documents.value.filter((d) => d.source !== 'local');
    rootIdentity.value = identity;
    root.value = handle;
    permission.value = true;
    await readRoot();
  } catch (error) {
    if (ticket === revision && !(error instanceof DOMException && error.name === 'AbortError'))
      notice.value = errorText(error);
  } finally {
    if (ticket === revision) connecting.value = false;
  }
}
async function reauthorize() {
  if (!root.value) return;
  const ticket = revision;
  try {
    const granted = await verifyLocalPermission(root.value, false, true);
    if (ticket !== revision) return;
    permission.value = granted;
    if (permission.value) await readRoot();
  } catch (error) {
    notice.value = errorText(error);
  }
}
async function disconnectFolder() {
  if (
    documents.value.some((d) => d.source === 'local' && dirty(d)) &&
    !confirm(
      props.zh ? '本机文件有未保存修改，仍要断开吗？' : 'Disconnect with unsaved local edits?'
    )
  )
    return;
  const ticket = revision;
  await Promise.all(documents.value.filter((d) => d.source === 'local').map(flushDraft));
  await disconnectLocalRoot(owner.value, project.value);
  if (ticket !== revision) return;
  documents.value.filter((d) => d.source === 'local').forEach(disposeDocument);
  documents.value = documents.value.filter((d) => d.source !== 'local');
  root.value = null;
  localNodes.value = [];
  permission.value = false;
}
async function fetchBlob(file: WorkspaceFile) {
  if (!/^\/api\/assets\/[a-f0-9-]+$/i.test(file.url)) throw new Error('WORKSPACE_FILE_URL_INVALID');
  if (file.byteSize > 40 * 1024 * 1024) throw new Error('WORKSPACE_FILE_TOO_LARGE');
  const response = await authFetch(buildApiUrl(file.url));
  if (!response.ok) throw new Error(`API_ERROR_${response.status}`);
  const blob = await response.blob();
  if (blob.size > 40 * 1024 * 1024) throw new Error('WORKSPACE_FILE_TOO_LARGE');
  return blob;
}
async function openNode(node: TreeNode) {
  const ticket = revision,
    current = scope(),
    folder = rootIdentity.value;
  try {
    if (node.directory) return;
    if (node.file) return openFile(node.file);
    const handle = node.handle as LocalFile;
    const info = await handle.getFile();
    if (ticket !== revision || current !== scope() || folder !== rootIdentity.value) return;
    return openFile(
      {
        id: node.id,
        path: node.path,
        revision: 0,
        assetId: '',
        mimeType: info.type || 'application/octet-stream',
        byteSize: info.size,
        sha256: '',
        url: ''
      },
      handle
    );
  } catch (error) {
    notice.value = errorText(error);
  }
}
async function openFile(file: WorkspaceFile, handle?: LocalFile) {
  if (compact.value) treeVisible.value = false;
  const key = (handle ? 'local:' + rootIdentity.value + ':' : 'cloud:') + file.id;
  const existing = documents.value.find(
    (d) => d.key === key || (d.source !== 'local' && !handle && d.file.id === file.id)
  );
  if (existing) {
    activeKey.value = existing.key;
    return;
  }
  const doc = reactive<Document>({
    key,
    generation: 0,
    owner: owner.value,
    scope: scope(),
    file,
    source: handle
      ? 'local'
      : file.id.startsWith('artifact:') && !project.value
        ? 'artifact'
        : 'cloud',
    handle,
    baseline: '',
    baselineHash: '',
    view: 'preview',
    loading: true,
    error: ''
  });
  documents.value.push(doc);
  activeKey.value = key;
  await reloadDocument(doc);
}
async function reloadDocument(doc: Document) {
  if (
    dirty(doc) &&
    !confirm(
      props.zh ? '重新读取会丢弃当前未保存修改，继续吗？' : 'Discard unsaved edits and reload?'
    )
  )
    return;
  const ticket = revision;
  const generation = ++doc.generation;
  const current = scope();
  doc.loading = true;
  doc.error = '';
  try {
    let blob: Blob;
    let text: string | undefined;
    if (doc.file.id.startsWith('new:')) {
      text = '';
      blob = new Blob([''], { type: 'text/plain' });
    } else if (doc.handle) {
      blob = await doc.handle.getFile();
    } else if (project.value) {
      const loaded = await readWorkspaceFile(project.value, doc.file.id).catch((error) => {
        if (
          doc.file.byteSize > MAX_TEXT_BYTES ||
          !(
            /^text\//.test(doc.file.mimeType) ||
            /\.(md|txt|json|html|css|js|ts|csv)$/i.test(doc.file.path)
          )
        )
          return null;
        throw error;
      });
      if (loaded) {
        text = loaded.text;
        doc.file = loaded.file;
        blob = new Blob([text], { type: doc.file.mimeType });
      } else blob = await fetchBlob(doc.file);
    } else blob = await fetchBlob(doc.file);
    if (ticket !== revision || scope() !== current || disposed || generation !== doc.generation)
      return;
    if (blob.size > 40 * 1024 * 1024) throw new Error('WORKSPACE_FILE_TOO_LARGE');
    const maybeText =
      text !== undefined ||
      /^text\//.test(doc.file.mimeType) ||
      /\.(md|txt|json|html|css|js|ts|tsx|jsx|csv|py|ya?ml)$/i.test(doc.file.path);
    if (maybeText && text === undefined && blob.size <= MAX_TEXT_BYTES) {
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          await blob.arrayBuffer()
        );
      } catch {
        /* Binary preview remains available. */
      }
    }
    if (ticket !== revision || scope() !== current || disposed || generation !== doc.generation)
      return;
    doc.blob = blob;
    doc.text = text;
    doc.baseline = text || '';
    doc.baselineHash = text !== undefined ? await contentHash(text) : '';
    if (ticket !== revision || generation !== doc.generation || disposed) return;
    if (doc.objectUrl) URL.revokeObjectURL(doc.objectUrl);
    doc.objectUrl = URL.createObjectURL(blob);
    doc.view = maybeText && !/\.(md|markdown|html?)$/i.test(doc.file.path) ? 'source' : 'preview';
    const draft = await loadEditorDraft(doc.owner, doc.scope + keyForDraft(doc)).catch(() => null);
    if (ticket !== revision || scope() !== current || disposed || generation !== doc.generation)
      return;
    if (draft && draft.baseline === doc.baseline) {
      doc.text = draft.text;
      notice.value = props.zh ? '已恢复本机未保存草稿。' : 'Unsaved draft restored.';
    } else if (draft) {
      notice.value = props.zh
        ? '发现旧草稿，但原文件已改变；未覆盖当前文件。'
        : 'The file changed since its saved draft. It was not overwritten.';
    }
  } catch (error) {
    if (ticket === revision) doc.error = errorText(error);
  } finally {
    if (ticket === revision) doc.loading = false;
  }
}
const keyForDraft = (doc: Document) => ':' + doc.key;
async function flushDraft(doc: Document) {
  if (doc.draftTimer) {
    clearTimeout(doc.draftTimer);
    doc.draftTimer = undefined;
  }
  if (!dirty(doc)) return;
  try {
    const saved = await saveEditorDraft(
      doc.owner,
      doc.scope + keyForDraft(doc),
      doc.file.path,
      doc.text!,
      doc.baseline
    );
    if (!saved && doc.scope === scope())
      notice.value = props.zh
        ? '此文件不缓存草稿，请及时保存。'
        : 'Draft caching is disabled; save this file.';
  } catch (error) {
    if (doc.scope === scope()) notice.value = errorText(error);
  }
}
function edit(doc: Document, text: string) {
  doc.text = text;
  if (doc.draftTimer) clearTimeout(doc.draftTimer);
  doc.draftTimer = setTimeout(() => void flushDraft(doc), 350);
}
async function save(doc: Document, replacement?: string) {
  if (saving.value || !editable(doc)) return false;
  const originalText = doc.text;
  const text = replacement ?? doc.text!;
  const ticket = revision;
  const generation = doc.generation;
  const current = scope();
  const oldDraftKey = current + keyForDraft(doc);
  saving.value = true;
  notice.value = '';
  if (doc.draftTimer) {
    clearTimeout(doc.draftTimer);
    doc.draftTimer = undefined;
  }
  try {
    if (doc.handle) {
      await writeLocalText(doc.handle, text, doc.baselineHash);
    } else {
      const response = await saveWorkspaceFile(
        project.value,
        doc.file.assetId ? doc.file : null,
        text,
        doc.file.path
      );
      if (ticket !== revision) return false;
      doc.file = response.file;
    }
    if (ticket !== revision || scope() !== current || disposed || generation !== doc.generation)
      return false;
    const submitted = text;
    const newer = doc.text !== originalText;
    doc.baseline = submitted;
    doc.baselineHash = await contentHash(submitted);
    if (ticket !== revision || generation !== doc.generation || disposed) return false;
    if (!newer) doc.text = submitted;
    if (replacement === undefined) doc.undo = undefined;
    doc.blob = new Blob([submitted], { type: doc.file.mimeType });
    if (doc.objectUrl) URL.revokeObjectURL(doc.objectUrl);
    doc.objectUrl = URL.createObjectURL(doc.blob);
    await clearEditorDraft(doc.owner, oldDraftKey);
    if (dirty(doc)) edit(doc, doc.text!);
    void refreshFiles();
    notice.value = props.zh ? '文件已保存。' : 'File saved.';
    return true;
  } catch (error) {
    if (ticket === revision) notice.value = errorText(error);
    return false;
  } finally {
    if (ticket === revision) saving.value = false;
  }
}
async function closeDocument(doc: Document) {
  if (dirty(doc) && !confirm(props.zh ? '丢弃此文件未保存的修改？' : 'Discard unsaved changes?'))
    return;
  disposeDocument(doc);
  await clearEditorDraft(doc.owner, doc.scope + keyForDraft(doc));
  documents.value = documents.value.filter((d) => d.key !== doc.key);
  if (activeKey.value === doc.key) activeKey.value = documents.value.at(-1)?.key || '';
}
async function newTextFile() {
  const path = prompt(
    props.zh
      ? '输入新文件的相对路径，例如 notes/brief.md'
      : 'Relative file path, for example notes/brief.md'
  );
  if (!path) return;
  if (
    path.startsWith('/') ||
    path.split('/').some((p) => !p || p === '.' || p === '..') ||
    /[\\\x00-\x1f]/.test(path)
  ) {
    notice.value = '文件路径无效。';
    return;
  }
  await openFile({
    id: 'new:' + crypto.randomUUID(),
    path,
    revision: 0,
    assetId: '',
    mimeType: 'text/plain',
    byteSize: 0,
    sha256: '',
    url: ''
  });
}
function download(doc: Document) {
  if (!doc.objectUrl) return;
  const link = document.createElement('a');
  link.href = doc.objectUrl;
  link.download = filename(doc.file.path);
  link.click();
}
async function attach(doc: Document) {
  if (dirty(doc) || !doc.blob) return;
  const ticket = revision,
    user = owner.value,
    projectId = project.value;
  if (sensitiveFile(doc.file.path)) {
    notice.value = '密钥或私密配置文件不能加入云端上下文。';
    return;
  }
  const file = new File([doc.text === undefined ? doc.blob : doc.text], filename(doc.file.path), {
    type: doc.text === undefined ? doc.file.mimeType : 'text/plain'
  });
  if (!file.size) {
    notice.value = '空文件不能作为输入附件。';
    return;
  }
  const digest =
    doc.text === undefined
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())))
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('')
      : doc.baselineHash;
  if (ticket !== revision || user !== owner.value || projectId !== project.value || disposed)
    return;
  const reference: WorkspaceFileRef = {
    source: doc.source,
    id: doc.source === 'local' ? doc.key : doc.file.id,
    name: filename(doc.file.path),
    projectId: project.value,
    sha256: digest,
    ...(doc.file.assetId ? { assetId: doc.file.assetId } : {}),
    originArtifactId: doc.file.originArtifactId
  };
  const attachment: WorkspaceAttachment = { owner: user, project: projectId, file, reference };
  if (route.path !== '/artigen/create') {
    stageWorkspaceAttachment(owner.value, project.value, attachment);
    const navigation = await router.push({
      path: '/artigen/create',
      query: {
        ...(project.value ? { projectId: project.value } : {}),
        ...(route.params.runId ? { sourceRun: String(route.params.runId) } : {})
      }
    });
    if (isNavigationFailure(navigation)) {
      takeWorkspaceAttachment(user, projectId);
      notice.value = props.zh
        ? '尚未切换到会话，文件未加入。请处理未保存编辑后重试。'
        : 'The chat did not open. Resolve unsaved edits and try again.';
      return;
    }
  } else {
    window.dispatchEvent(new CustomEvent('workspace:attach-file', { detail: attachment }));
    if (!attachment.accepted) {
      notice.value = props.zh
        ? '文件未加入。请等待发送完成，检查当前项目或移除部分附件后重试。'
        : 'File was not added. Check the project, wait for sending, or remove a reference and retry.';
      return;
    }
  }
  notice.value = props.zh
    ? '已加入会话输入；发送后才会上传。'
    : 'Added to the chat input. It uploads only after you send.';
}
async function chooseProposal(id: string) {
  if (!id) {
    proposal.value = null;
    return;
  }
  if (!active.value || dirty(active.value)) {
    notice.value = '请先保存或丢弃当前修改，再比较候选文件。';
    return;
  }
  const target = active.value;
  const ticket = revision;
  try {
    const file = files.value.find((f) => f.id === id);
    if (!file) return;
    if (
      file.editTarget &&
      (file.editTarget.id !== (target.source === 'local' ? target.key : target.file.id) ||
        file.editTarget.sha256 !== target.baselineHash)
    ) {
      notice.value = props.zh
        ? '候选基于另一个文件或旧版本，请重新加入当前文件并生成。'
        : 'This proposal targets another file or base version. Generate it again.';
      return;
    }
    const text = project.value
      ? (await readWorkspaceFile(project.value, file.id)).text
      : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          await (await fetchBlob(file)).arrayBuffer()
        );
    if (ticket === revision && active.value === target)
      proposal.value = { text, candidateId: id, baseHash: target.baselineHash };
  } catch (error) {
    if (ticket === revision) notice.value = errorText(error);
  }
}
async function applyProposal() {
  const doc = active.value;
  const pending = proposal.value;
  if (!doc || !pending || saving.value) return;
  if (dirty(doc) || pending.baseHash !== doc.baselineHash) {
    notice.value = props.zh
      ? '文件已改变，请先保存并重新查看候选差异。'
      : 'The file changed. Save and compare the proposal again.';
    return;
  }
  const original = doc.baseline;
  if (await save(doc, pending.text)) {
    doc.undo = original;
    proposal.value = null;
  }
}
async function undoApply() {
  const doc = active.value;
  if (!doc || doc.undo === undefined) return;
  if (dirty(doc)) {
    notice.value = props.zh
      ? '请先保存或丢弃当前修改，再撤销应用。'
      : 'Save or discard current edits before undoing.';
    return;
  }
  const old = doc.undo;
  if (await save(doc, old)) doc.undo = undefined;
}
async function compareVersion(number: number) {
  const doc = active.value;
  if (!doc || !Number.isInteger(number) || !project.value) return;
  const ticket = revision;
  try {
    const data = await readWorkspaceFile(project.value, doc.file.id, number);
    if (ticket === revision && active.value === doc) {
      proposal.value = {
        text: data.text,
        candidateId: 'version:' + number,
        baseHash: doc.baselineHash
      };
      emit('changes');
    }
  } catch (error) {
    if (ticket === revision) notice.value = errorText(error);
  }
}
function toggleTree() {
  treeVisible.value = !treeVisible.value;
  try {
    localStorage.setItem('artigen-resource-tree-visible', String(treeVisible.value));
  } catch {}
}
const onOpenFile = (event: Event) => {
  const detail = (event as CustomEvent<WorkspaceFile>).detail;
  const found = files.value.find((f) => f.id === detail?.id || f.assetId === detail?.assetId);
  if (found) void openFile(found);
};
const authChanged = () => {
  owner.value = getCurrentUserId();
  void reset();
};
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (documents.value.some(dirty)) {
    event.preventDefault();
    event.returnValue = '';
  }
};
const confirmLeave = () =>
  !documents.value.some(dirty) ||
  confirm(props.zh ? '仍有未保存的文件修改，要离开吗？' : 'Leave with unsaved file edits?');
const canLeave = async () => {
  if (!confirmLeave()) return false;
  await Promise.all(documents.value.map(flushDraft));
  return true;
};
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate((to, from) => to.fullPath === from.fullPath || canLeave());
watch(
  () => project.value,
  () => void reset()
);
watch(
  () => props.artifacts.map((a) => a.artifactId).join(','),
  () => void refreshFiles()
);
watch(activeKey, async () => {
  proposal.value = null;
  versions.value = [];
  zoom.value = 1;
  const ticket = ++openRevision;
  const doc = active.value;
  if (doc && project.value && !doc.file.id.includes(':')) {
    try {
      const result = await getWorkspaceVersions(project.value, doc.file.id);
      if (ticket === openRevision) versions.value = result.versions;
    } catch {
      /* Version control stays usable after reload. */
    }
  }
});
watch(
  () => [props.mode, active.value?.text, active.value?.baseline, proposal.value?.text],
  async () => {
    if (props.mode !== 'changes') return;
    const doc = active.value;
    if (!doc) {
      statistics.value = { added: 0, removed: 0 };
      return;
    }
    const a = doc.baseline,
      b = proposal.value?.text ?? doc.text ?? '';
    const { changedLineCounts } = await import('../../services/workspaceChanges');
    if (doc === active.value) statistics.value = changedLineCounts(a, b);
  }
);
watch(
  () => [props.mode, activeKey.value, files.value.map((f) => f.id).join(',')],
  () => {
    const doc = active.value;
    if (props.mode !== 'changes' || !doc || proposal.value || dirty(doc)) return;
    const targetId = doc.source === 'local' ? doc.key : doc.file.id;
    const candidate = candidateFiles.value.find(
      (f) => f.editTarget?.id === targetId && f.editTarget.sha256 === doc.baselineHash
    );
    if (candidate) void chooseProposal(candidate.id);
  }
);
const flushOnHide = () => {
  if (document.visibilityState === 'hidden') documents.value.forEach((doc) => void flushDraft(doc));
};
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    compact.value = (entries[0]?.contentRect.width || 0) < 640;
  });
  if (resourceRoot.value) observer.observe(resourceRoot.value);
  try {
    treeVisible.value = localStorage.getItem('artigen-resource-tree-visible') !== 'false';
  } catch {}
  void reset();
  window.addEventListener('workspace:open-file', onOpenFile);
  window.addEventListener('app-auth-changed', authChanged);
  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('visibilitychange', flushOnHide);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  disposed = true;
  revision++;
  openRevision++;
  documents.value.forEach((doc) => {
    void flushDraft(doc);
    disposeDocument(doc);
  });
  window.removeEventListener('workspace:open-file', onOpenFile);
  window.removeEventListener('app-auth-changed', authChanged);
  window.removeEventListener('beforeunload', beforeUnload);
  document.removeEventListener('visibilitychange', flushOnHide);
});
</script>
<style scoped>
.resource-workspace {
  container-type: inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.file-tabs {
  display: flex;
  min-height: 44px;
  overflow: auto;
  flex: none;
  background: var(--sidebar);
  padding: 3px 5px;
  gap: 3px;
}
.file-tab {
  display: flex;
  flex: none;
  max-width: 230px;
  align-items: center;
  border-radius: 7px;
  background: transparent;
}
.file-tab.active {
  background: var(--surface-hover);
}
.file-tab > button {
  display: flex;
  min-width: 0;
  gap: 7px;
  align-items: center;
  background: transparent;
  color: var(--muted);
  border: 0;
  padding: 8px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.file-tab.active > button {
  color: var(--text);
}
.file-tab span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tab > button:last-child {
  padding: 7px;
}
.tree-toggle {
  display: grid;
  place-items: center;
  flex: none;
  margin-left: auto;
  width: 36px;
  min-height: 36px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.file-body {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex: 1;
}
.file-viewer {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}
.resource-tree {
  width: 224px;
  flex: none;
  overflow: auto;
  padding: 8px;
  background: var(--sidebar);
  scrollbar-color: var(--border) transparent;
}
.file-search {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 7px;
  border: 1px solid var(--border);
  border-radius: 7px;
}
.file-search input {
  width: 100%;
  min-width: 0;
  background: transparent;
  color: var(--text);
  border: 0;
  outline: 0;
  font: inherit;
  font-size: 12px;
}
.tree-section-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 15px 0 5px;
  font-size: 12px;
  color: var(--muted);
}
.tree-section-heading > span {
  flex: 1;
}
.tree-section-heading button,
.local-root button {
  display: grid;
  place-items: center;
  min-width: 28px;
  min-height: 28px;
  padding: 3px;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.resource-tree p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
  padding: 4px;
}
.local-root {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  padding: 5px;
}
.local-root > b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: space-between;
  align-items: center;
  min-height: 46px;
  padding: 7px 10px;
}
.breadcrumb {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--muted);
}
.viewer-actions {
  display: flex;
  gap: 3px;
  align-items: center;
}
.viewer-actions button,
.file-status button,
.resource-empty button,
.change-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  color: var(--text);
  background: var(--surface);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.viewer-actions button[aria-pressed='true'] {
  background: var(--surface-hover);
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.resource-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 24px;
  color: var(--muted);
  text-align: center;
}
.resource-empty h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}
.resource-empty p {
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
  max-width: 34ch;
}
.document-preview {
  padding: 24px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.text-preview {
  margin: 0;
  padding: 20px;
  overflow: auto;
  flex: 1;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font:
    13px/1.75 ui-monospace,
    monospace;
}
.html-preview {
  border: 0;
  background: white;
  flex: 1;
  min-height: 0;
  width: 100%;
}
.image-viewer {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}
.image-viewer > div {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 20px;
}
.image-viewer button {
  border: 0;
  padding: 7px 10px;
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.image-viewer img {
  display: block;
  max-height: none;
  object-fit: contain;
  margin: auto;
}
.file-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--border);
}
.file-status > span {
  flex: 1;
}
.file-status select {
  min-width: 0;
  max-width: 130px;
  font-size: 12px;
  color: var(--text);
  background: var(--surface);
  border: 0;
  padding: 5px;
}
.resource-notice {
  flex: none;
  margin: 0;
  padding: 10px 12px;
  background: var(--surface);
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}
.resource-loading {
  padding: 20px;
  font-size: 13px;
  color: var(--muted);
}
.changes-panel {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}
.changes-panel > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  font-size: 13px;
}
.changes-panel > header > b {
  flex: 1;
}
.changes-panel > p {
  font-size: 12px;
  color: var(--muted);
  padding: 0 16px;
}
.changes-panel > label {
  display: grid;
  gap: 6px;
  padding: 10px 16px;
  font-size: 12px;
}
.changes-panel select {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 7px;
  border-radius: 6px;
  max-width: 100%;
}
.change-actions {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
}
.added {
  color: var(--success);
}
.removed {
  color: var(--danger);
}
.compact-tree:not(.tree-hidden) .file-viewer {
  display: none;
}
.compact-tree:not(.tree-hidden) .resource-tree {
  width: 100%;
  flex: 1;
}
@container (max-width:639px) {
  .resource-tree {
    width: 190px;
  }
  .file-toolbar {
    align-items: flex-start;
  }
  .viewer-actions {
    flex-wrap: wrap;
  }
}
@media (max-width: 799px) {
  .resource-tree {
    width: 175px;
  }
  .document-preview {
    padding: 16px;
  }
  .file-tab > button,
  .tree-toggle,
  .viewer-actions button,
  .file-status button,
  .tree-section-heading button,
  .image-viewer button,
  .local-root button {
    min-width: 44px;
    min-height: 44px;
  }
  .file-toolbar {
    padding: 6px;
  }
  .viewer-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .file-viewer:has(.resource-empty) {
    min-width: 0;
  }
  .file-tabs {
    min-height: 48px;
  }
}
</style>
