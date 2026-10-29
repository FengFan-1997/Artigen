<template>
  <div
    ref="resourceRoot"
    class="resource-workspace"
    :class="{ 'tree-hidden': !treeVisible, 'compact-tree': compact }"
  >
    <div v-if="mode === 'github'" class="github-project-workspace">
      <WorkspaceProjectPicker :key="`${owner}:${runId}`" :project-id="projectId" :viewed-project-id="viewedProjectId" :run-id="runId" :run-status="runStatus" :zh="zh" @view-project="viewedProjectId = $event" @project-associated="$emit('project-associated', $event)" />
      <WorkspaceGithub :key="`${owner}:${viewedProjectId}`" :project-id="viewedProjectId" :zh="zh" />
    </div>
    <template v-else>
      <div class="file-tabs-bar">
        <div
          ref="fileTabs"
          class="file-tabs"
          role="tablist"
          :aria-label="zh ? '已打开文件' : 'Open files'"
        >
          <div
            v-for="doc in documents"
            :key="doc.key"
            class="file-tab"
            :data-document-key="doc.key"
            :class="{ active: activeKey === doc.key }"
          >
            <button
              role="tab"
              :title="doc.file.path"
              :aria-label="
                filename(doc.file.path) + (dirty(doc) ? (zh ? '（未保存）' : ' (unsaved)') : '')
              "
              :aria-selected="activeKey === doc.key"
              :tabindex="activeKey === doc.key ? 0 : -1"
              @click="activeKey = doc.key"
              @keydown="onFileTabKeydown(doc, $event)"
            >
              <WorkspaceIcon
                :name="doc.file.mimeType.startsWith('image/') ? 'image' : 'file'"
                :size="14"
              /><span class="file-tab-name">{{ filename(doc.file.path) }}</span>
              <span v-if="dirty(doc)" class="file-tab-dirty" aria-hidden="true"></span></button
            ><button
              class="file-tab-close"
              :aria-label="
                zh ? `关闭 ${filename(doc.file.path)}` : `Close ${filename(doc.file.path)}`
              "
              @click="closeDocument(doc)"
            >
              <WorkspaceIcon name="close" :size="14" />
            </button>
          </div>
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
      <div v-if="notice" class="resource-notice">
        <WorkspaceIcon class="resource-notice-icon" name="file" :size="16" />
        <p role="status">{{ notice }}</p>
        <button
          class="resource-notice-close"
          type="button"
          :aria-label="zh ? '关闭文件通知' : 'Dismiss file notice'"
          @click="dismissNotice"
        ><WorkspaceIcon name="close" :size="16" /></button>
      </div>
      <form v-if="newFile.open" class="new-file-form" :aria-label="zh ? '新建文本文件' : 'New text file'" novalidate @submit.prevent="createTextFile" @keydown="onNewFileKeydown">
        <h2>{{ zh ? '新建文本文件' : 'New text file' }}</h2>
        <label :for="newFileId">{{ zh ? '相对路径' : 'Relative path' }}</label>
        <input :id="newFileId" ref="newFileInput" v-model="newFile.path" name="path" placeholder="notes/brief.md" autocomplete="off" autocapitalize="none" :spellcheck="false" required :aria-invalid="Boolean(newFile.error)" :aria-describedby="`${newFileId}-help${newFile.error ? ` ${newFileId}-error` : ''}`" @input="newFile.error = ''" />
        <p :id="`${newFileId}-help`">{{ zh ? '使用项目内的相对路径。输入内容后，点击保存才会写入项目。' : 'Use a path within this project. Content is written only when you save.' }}</p>
        <p v-if="newFile.error" :id="`${newFileId}-error`" role="alert">{{ newFile.error }}</p>
        <div class="new-file-actions">
          <button type="submit">{{ zh ? '创建文件' : 'Create file' }}</button>
          <button type="button" @click="closeNewFile()">{{ zh ? '取消' : 'Cancel' }}</button>
        </div>
      </form>
      <div class="file-body">
        <aside
          v-show="treeVisible"
          class="resource-tree"
          :aria-label="zh ? '文件目录' : 'File explorer'"
        >
          <div class="file-search">
            <WorkspaceIcon name="search" />
            <input
              ref="fileSearchInput"
              v-model="search"
              :placeholder="zh ? '筛选项目文件…' : 'Filter project files…'"
              :title="zh ? '仅筛选已加载的项目文件' : 'Filters loaded project files only'"
              :aria-label="zh ? '筛选文件' : 'Filter files'"
              @keydown.esc="onFileSearchEscape"
            />
            <button v-if="search" class="file-search-clear" type="button" :aria-label="zh ? '清除文件筛选' : 'Clear file filter'" @click="clearFileSearch">
              <WorkspaceIcon name="close" :size="14" />
            </button>
          </div>
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
          <WorkspaceFileTree :zh="zh" :nodes="projectNodes" :active="active?.file.id" @open="openNode" />
          <p v-if="!files.length">{{ zh ? '暂无文件' : 'No files yet' }}</p>
          <p v-else-if="search && !projectNodes.length" class="file-search-empty" role="status">
            <span>{{ zh ? '没有匹配的项目文件' : 'No matching project files' }}</span>
            <span>{{ zh ? '仅筛选已加载的项目文件。' : 'Only loaded project files are filtered.' }}</span>
          </p>
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
              <WorkspaceIcon name="folder" :size="16" />
              <span class="local-root-name" :title="root.name">{{ root.name }}</span>
              <button
                type="button"
                :aria-label="zh ? `断开文件夹 ${root.name}` : `Disconnect folder ${root.name}`"
                :title="zh ? '断开文件夹连接' : 'Disconnect folder'"
                @click="disconnectFolder"
              >
                <WorkspaceIcon name="close" :size="14" />
              </button>
            </div>
            <div v-if="!permission" class="local-permission">
              <strong>{{ zh ? '需要重新授权' : 'Folder access needed' }}</strong>
              <p>{{ zh ? '允许后可继续读取本机文件。' : 'Allow access to read local files again.' }}</p>
              <button
                type="button"
                class="local-permission-action"
                :disabled="connecting"
                :aria-busy="connecting"
                @click="reauthorize"
              >
                <span>{{ connecting ? (zh ? '正在授权…' : 'Authorizing…') : (zh ? '重新授权目录' : 'Authorize folder again') }}</span>
                <WorkspaceIcon :name="connecting ? 'refresh' : 'arrow-right'" :size="16" />
              </button>
              <p v-if="permissionError" role="status">{{ permissionError }}</p>
            </div>
            <WorkspaceFileTree
              v-else
              :key="localRootRevision"
              :nodes="localNodes"
              :zh="zh"
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
        <section class="file-viewer">
          <div v-if="active" class="file-toolbar" :class="{ 'is-comparison': mode === 'changes' }">
            <div class="breadcrumb" :title="active.file.path" role="group" :aria-label="zh ? '文件位置' : 'File location'">
              <span class="breadcrumb-source">{{ active.source === 'local' ? (zh ? '本机' : 'Local') : zh ? '项目' : 'Project' }}</span>
              <WorkspaceIcon name="chevron-right" :size="14" />
              <span class="breadcrumb-path"><span class="breadcrumb-directory">{{ active.file.path.slice(0, active.file.path.lastIndexOf('/') + 1) }}</span><span class="breadcrumb-filename">{{ filename(active.file.path) }}</span></span>
            </div>
            <div class="viewer-actions">
              <div
                v-if="active.text !== undefined && mode !== 'changes'"
                class="view-mode-switch"
                role="group"
                :aria-label="zh ? '文件显示方式' : 'File view'"
              >
                <button
                  type="button"
                  :aria-pressed="active.view === 'preview'"
                  @click="active.view = 'preview'"
                >{{ zh ? '预览' : 'Preview' }}</button>
                <button
                  type="button"
                  :aria-pressed="active.view === 'source'"
                  @click="active.view = 'source'"
                >{{ zh ? '源码' : 'Source' }}</button>
              </div>
              <button
                v-if="active.text !== undefined && mode !== 'changes'"
                :disabled="!canSave(active) || saving"
                @click="save(active)"
              >
                {{ saving ? (zh ? '保存中…' : 'Saving…') : zh ? '保存' : 'Save' }}</button
              ><button
                v-if="active.blob"
                :aria-label="
                  zh
                    ? `下载 ${filename(active.file.path)}`
                    : `Download ${filename(active.file.path)}`
                "
                @click="download(active)"
              >
                <WorkspaceIcon name="download" />
              </button>
            </div>
          </div>
          <div v-if="mode === 'changes'" class="changes-panel">
            <template v-if="active?.text !== undefined"
              ><header>
                <b>{{ filename(active.file.path) }}</b
                ><template v-if="hasChanges && statistics"><span class="added">+{{ statistics.added }}</span
                ><span class="removed">−{{ statistics.removed }}</span></template>
              </header>
              <p :id="`${comparisonPickerId}-description`">{{ comparisonDescription }}</p>
              <div v-if="candidateFiles.length" class="comparison-picker">
                <label :for="comparisonPickerId">{{ zh ? '比较来源' : 'Comparison source' }}</label>
                <NativeSelectFrame><select class="workspace-select"
                  :id="comparisonPickerId"
                  :value="proposal?.candidateId || ''"
                  :title="comparisonSourceLabel"
                  :aria-describedby="`${comparisonPickerId}-description`"
                  @change="chooseProposal(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ zh ? '当前编辑' : 'Current edits' }}</option>
                  <option v-if="comparisonVersion" :value="proposal?.candidateId" disabled>{{ comparisonSourceLabel }}</option>
                  <option v-for="file in candidateFiles" :key="file.id" :value="file.id">
                    {{ file.path }}
                  </option>
                </select></NativeSelectFrame>
              </div>
              <div v-if="hasChanges || active.undo !== undefined" class="change-actions">
                <button v-if="proposal && hasChanges" :disabled="saving" @click="applyProposal">
                  {{ zh ? '应用到当前文件' : 'Apply to current file' }}</button
                ><button v-if="active.undo !== undefined" :disabled="saving" @click="undoApply">
                  {{ zh ? '撤销最近一次应用' : 'Undo last application' }}</button
                ><button v-if="!proposal && dirty(active)" :disabled="saving" @click="save(active)">
                  {{ zh ? '保存当前修改' : 'Save changes' }}
                </button>
              </div>
              <WorkspaceEditor
                v-if="hasChanges"
                :key="active.key + ':diff:' + String(proposal?.candidateId || '')"
                :model-value="proposal?.text ?? active.text"
                :compare-to="active.baseline"
                :path="active.file.path"
                :readonly="true"
                :label="zh ? '文件差异' : 'File differences'"
                :theme="theme"
              />
              <div v-else class="changes-empty" role="status">
                <WorkspaceIcon name="git" :size="20" />
                <div>
                  <h2>{{ zh ? '两份内容一致' : 'Contents are identical' }}</h2>
                  <p>{{ zh ? '可继续编辑文件，或选择其他版本进行比较。' : 'Continue editing the file or choose another version to compare.' }}</p>
                </div>
              </div>
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
            <div v-if="active.loading" class="resource-loading" role="region" :aria-label="zh ? '文件读取' : 'File loading'" aria-busy="true">
              <WorkspaceIcon name="file" :size="16" />
              <div>
                <p class="resource-loading-name" :title="active.file.path">{{ filename(active.file.path) }}</p>
                <p role="status">{{ zh ? '正在读取文件…' : 'Opening file…' }}</p>
              </div>
            </div>
            <div v-else-if="active.error" class="resource-empty file-read-error">
              <div class="file-read-content">
                <WorkspaceIcon name="file" :size="20" />
                <h2>{{ zh ? '暂时无法打开文件' : 'Could not open file' }}</h2>
                <p class="file-read-name" :title="active.file.path">{{ filename(active.file.path) }}</p>
                <p role="alert">{{ active.error }}</p>
                <button type="button" class="file-read-retry" @click="reloadDocument(active)">
                  <WorkspaceIcon name="refresh" :size="16" />{{ zh ? '重新读取' : 'Reload file' }}
                </button>
              </div>
            </div>
            <WorkspaceEditor
              v-else-if="active.text !== undefined && active.view === 'source'"
              :key="active.key"
              :model-value="active.text"
              :path="active.file.path"
              :readonly="!editable(active)"
              :label="zh ? '文件编辑器' : 'File editor'"
              :theme="theme"
              @update:model-value="edit(active!, $event)"
              @save="save(active!)"
            />
            <div
              v-else-if="
                /^image\/(png|jpeg|webp|gif)$/.test(active.file.mimeType) && active.objectUrl
              "
              class="image-viewer"
            >
              <div v-if="active.imageError" class="image-preview-error" role="status">
                <WorkspaceIcon name="image" :size="20" />
                <div>
                  <h2>{{ zh ? '图片暂时无法预览' : 'Image preview unavailable' }}</h2>
                  <p>{{ zh ? '可以使用上方下载按钮，下载原文件后打开。' : 'Use Download above to open the original file on your device.' }}</p>
                </div>
              </div>
              <template v-else>
                <div class="image-controls" role="group" :aria-label="zh ? '图片缩放' : 'Image zoom'">
                  <button
                    :aria-label="zh ? '缩小图片' : 'Zoom out'"
                    :disabled="zoom <= 0.25"
                    @click="zoom = Math.max(0.25, zoom - 0.25)"
                  >
                    <WorkspaceIcon name="minus" :size="18" />
                  </button>
                  <button
                    class="image-zoom-reset"
                    :aria-label="zh ? `适合宽度，当前 ${Math.round(zoom * 100)}%` : `Fit to width, currently ${Math.round(zoom * 100)}%`"
                    :title="zh ? '适合宽度' : 'Fit to width'"
                    @click="zoom = 1"
                  >{{ Math.round(zoom * 100) }}%</button>
                  <button
                    :aria-label="zh ? '放大图片' : 'Zoom in'"
                    :disabled="zoom >= 4"
                    @click="zoom = Math.min(4, zoom + 0.25)"
                  >
                    <WorkspaceIcon name="plus" :size="18" />
                  </button>
                </div>
                <div class="image-canvas">
                  <img
                    :key="active.objectUrl"
                    :src="active.objectUrl"
                    :alt="filename(active.file.path)"
                    @error="imagePreviewFailed"
                    :style="{ width: 100 * zoom + '%', maxWidth: zoom === 1 ? '100%' : 'none' }"
                  />
                </div>
              </template>
            </div>
            <WorkspacePdf
              v-else-if="active.file.mimeType === 'application/pdf' && active.blob"
              :key="active.key"
              :blob="active.blob"
              :zh="zh"
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
            <div v-else class="resource-empty binary-preview">
              <div class="binary-details">
                <WorkspaceIcon name="file" :size="20" />
                <h2 :title="active.file.path">{{ filename(active.file.path) }}</h2>
                <p>{{ zh ? '此文件暂不支持在线预览。' : 'No preview is available for this file.' }}</p>
                <dl class="binary-properties" :aria-label="zh ? '文件信息' : 'File information'">
                  <div><dt>{{ zh ? '文件类型' : 'File type' }}</dt><dd>{{ active.file.mimeType }}</dd></div>
                  <div><dt>{{ zh ? '文件大小' : 'File size' }}</dt><dd>{{ formatSize(active.file.byteSize) }}</dd></div>
                </dl>
                <button v-if="active.blob" class="binary-download" type="button" @click="download(active)">
                  <WorkspaceIcon name="download" :size="16" />{{ zh ? '下载后打开' : 'Download to open' }}
                </button>
              </div>
            </div>
            <footer v-if="!active.loading && !active.error" class="file-status">
              <span class="file-save-state"
                >{{ dirty(active) ? (zh ? '未保存' : 'Unsaved') : zh ? '已保存' : 'Saved' }} ·
                {{ active.source === 'local' ? (zh ? '本机' : 'Local') : `v${active.file.revision}` }}</span>
              <div class="file-status-actions">
                <button :disabled="!active.blob || dirty(active) || saving" @click="attach(active)">
                  {{ zh ? '加入会话上下文' : 'Add to chat context' }}</button
                ><button v-if="active.text !== undefined" @click="$emit('changes')">
                  {{ zh ? '查看变更' : 'View changes' }}</button
                ><label v-if="versions.length" class="file-version-control">
                  <span>{{ zh ? '比较版本' : 'Compare version' }}</span>
                  <NativeSelectFrame><select class="workspace-select"
                    :aria-label="zh ? '查看文件版本' : 'View file versions'"
                    @change="
                      ($event.target as HTMLSelectElement).value !== '' &&
                      compareVersion(Number(($event.target as HTMLSelectElement).value))
                    "
                  >
                    <option value="">{{ zh ? '选择…' : 'Choose…' }}</option>
                    <option
                      v-for="version in versions"
                      :key="version.revision"
                      :value="version.revision"
                    >
                      v{{ version.revision }}
                    </option>
                  </select></NativeSelectFrame>
                </label>
              </div>
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
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import NativeSelectFrame from '../NativeSelectFrame.vue';
import {
  computed,
  reactive,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
  nextTick
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
import WorkspaceProjectPicker from './WorkspaceProjectPicker.vue';
const WorkspaceEditor = defineAsyncComponent(() => import('./WorkspaceEditor.vue'));
const WorkspacePdf = defineAsyncComponent(() => import('./WorkspacePdf.vue'));
const props = withDefaults(
  defineProps<{
    mode: 'files' | 'changes' | 'github' | 'task';
    projectId?: string | null;
    artifacts: AgentArtifact[];
    zh: boolean;
    theme: 'light' | 'dark';
    runId?: string;
    runStatus?: string;
  }>(),
  { projectId: '', runId: '', runStatus: '' }
);
const emit = defineEmits<{ changes: []; 'focus-directory': []; 'project-associated': [value: { projectId: string; scope: 'run' | 'conversation'; affectedRunCount: number }] }>();
const viewedProjectId = ref(props.projectId || '');
watch(() => [props.projectId, props.runId], () => { viewedProjectId.value = props.projectId || ''; });
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
  imageError: boolean;
  undo?: string;
  draftTimer?: ReturnType<typeof setTimeout>;
};
const owner = ref(getCurrentUserId());
const files = ref<WorkspaceFile[]>([]);
const documents = ref<Document[]>([]);
const activeKey = ref('');
const notice = ref('');
const newFile = reactive({ open: false, path: '', error: '' });
const newFileId = useId();
const newFileInput = ref<HTMLInputElement | null>(null);
let newFileTrigger: HTMLElement | null = null;
const saving = ref(false);
const connecting = ref(false);
const root = ref<LocalDirectory | null>(null);
const rootIdentity = ref('');
const permission = ref(false);
const permissionError = ref('');
const localNodes = ref<TreeNode[]>([]);
const localRootRevision = ref(0);
const search = ref('');
const fileSearchInput = ref<HTMLInputElement | null>(null);
const clearFileSearch = () => {
  search.value = '';
  fileSearchInput.value?.focus();
};
const onFileSearchEscape = (event: KeyboardEvent) => {
  if (event.isComposing || event.keyCode === 229) {
    event.stopPropagation();
    return;
  }
  if (!search.value) return;
  event.preventDefault();
  event.stopPropagation();
  clearFileSearch();
};
const treeVisible = ref(true);
const zoom = ref(1);
const versions = ref<Array<{ revision: number; createdAt: string; sha256: string }>>([]);
const proposal = ref<{ text: string; candidateId: string; baseHash: string } | null>(null);
const statistics = ref<{ added: number; removed: number } | null>(null);
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
const hasChanges = computed(() => active.value?.text !== undefined && (proposal.value?.text ?? active.value.text) !== active.value.baseline);
const comparisonPickerId = useId();
const comparisonVersion = computed(() => proposal.value?.candidateId.startsWith('version:') ? proposal.value.candidateId.slice(8) : '');
const comparisonDescription = computed(() => {
  const version = comparisonVersion.value;
  if (version) return props.zh ? `历史版本 v${version} 与打开时版本的比较。` : `Version v${version} compared with the opened version.`;
  if (proposal.value) return props.zh ? 'Agent 候选内容，尚未写入文件。' : 'Agent proposal; not yet applied.';
  return props.zh ? '当前编辑与打开时版本的比较。' : 'Current edits compared with the opened version.';
});
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
const comparisonSourceLabel = computed(() => {
  if (comparisonVersion.value) return props.zh ? `历史版本 v${comparisonVersion.value}` : `Version v${comparisonVersion.value}`;
  if (!proposal.value) return props.zh ? '当前编辑' : 'Current edits';
  return candidateFiles.value.find(file => file.id === proposal.value?.candidateId)?.path || (props.zh ? 'Agent 候选内容' : 'Agent proposal');
});
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
    return props.zh ? '文件访问权限不足，请重新授权后重试。' : 'Authorize file access and retry.';
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
  closeNewFile(false);
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
  permissionError.value = '';
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
  const handle = root.value;
  const nodes = await readLocalDirectory({
    id: 'local-root',
    name: handle.name,
    path: '',
    directory: true,
    handle
  });
  if (ticket === revision && root.value === handle) {
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
  permissionError.value = '';
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
  if (!root.value || connecting.value) return;
  const handle = root.value;
  const ticket = revision;
  connecting.value = true;
  permissionError.value = '';
  try {
    const granted = await verifyLocalPermission(handle, false, true);
    if (ticket !== revision || root.value !== handle) return;
    if (!granted) {
      permissionError.value = props.zh
        ? '尚未获得目录访问权限，请重试。'
        : 'Folder access was not granted. Try again.';
      return;
    }
    await readRoot();
    if (ticket === revision && root.value === handle) permission.value = true;
  } catch (error) {
    if (ticket === revision && root.value === handle) permissionError.value = errorText(error);
  } finally {
    if (ticket === revision && root.value === handle) connecting.value = false;
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
  permissionError.value = '';
  connecting.value = false;
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
    loading: false,
    error: '',
    imageError: false
  });
  documents.value.push(doc);
  activeKey.value = key;
  await reloadDocument(doc);
}
async function reloadDocument(doc: Document) {
  if (doc.loading) return;
  const restoreFocus = Boolean(doc.error && activeKey.value === doc.key && document.activeElement?.closest('.file-read-error'));
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
  doc.imageError = false;
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
    doc.view = doc.file.id.startsWith('new:') || (maybeText && !/\.(md|markdown|html?)$/i.test(doc.file.path)) ? 'source' : 'preview';
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
    if (ticket === revision && generation === doc.generation && !disposed) doc.error = errorText(error);
  } finally {
    if (ticket === revision && generation === doc.generation && !disposed) {
      doc.loading = false;
      if (restoreFocus) {
        await nextTick();
        if (ticket === revision && activeKey.value === doc.key && document.activeElement === document.body) {
          const target = doc.error ? resourceRoot.value?.querySelector<HTMLButtonElement>('.file-read-retry') : selectedTab();
          target?.focus({ preventScroll: true });
        }
      }
    }
  }
}
function imagePreviewFailed(event: Event) {
  const url = (event.currentTarget as HTMLImageElement).src;
  const doc = documents.value.find((item) => item.objectUrl === url);
  if (doc) doc.imageError = true;
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
async function dismissNotice() {
  notice.value = '';
  await nextTick();
  const target = selectedTab() || resourceRoot.value?.querySelector<HTMLElement>('.tree-toggle');
  target?.focus({ preventScroll: true });
}
async function closeDocument(doc: Document) {
  if (dirty(doc) && !confirm(props.zh ? '丢弃此文件未保存的修改？' : 'Discard unsaved changes?'))
    return;
  const ticket = revision;
  const focused =
    document.activeElement?.closest<HTMLElement>('.file-tab')?.dataset.documentKey === doc.key;
  disposeDocument(doc);
  await clearEditorDraft(doc.owner, doc.scope + keyForDraft(doc));
  if (ticket !== revision || disposed) return;
  documents.value = documents.value.filter((d) => d.key !== doc.key);
  if (activeKey.value === doc.key) activeKey.value = documents.value.at(-1)?.key || '';
  if (focused) {
    await nextTick();
    const target = selectedTab() || resourceRoot.value?.querySelector<HTMLElement>('.tree-toggle');
    target?.focus({ preventScroll: true });
    (target?.closest('.file-tab') || target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
async function newTextFile(event: MouseEvent) {
  if (!project.value) return;
  newFileTrigger = event.currentTarget as HTMLElement;
  if (!newFile.open) {
    newFile.path = '';
    newFile.error = '';
    newFile.open = true;
  }
  await nextTick();
  newFileInput.value?.focus();
}
function closeNewFile(restoreFocus = true) {
  newFile.open = false;
  newFile.path = '';
  newFile.error = '';
  if (restoreFocus && newFileTrigger?.isConnected) newFileTrigger.focus({ preventScroll: true });
  newFileTrigger = null;
}
function onNewFileKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) {
    event.stopPropagation();
    if (event.key === 'Enter') event.preventDefault();
    return;
  }
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  closeNewFile();
}
async function createTextFile() {
  if (!newFile.open || !project.value) return;
  const path = newFile.path;
  if (
    !path ||
    path.startsWith('/') ||
    path.split('/').some((p) => !p || p === '.' || p === '..') ||
    /[\\\x00-\x1f]/.test(path)
  ) {
    newFile.error = props.zh ? '请输入有效的相对路径，不能包含空目录、.、.. 或反斜杠。' : 'Enter a valid relative path without empty folders, ., .. or backslashes.';
    newFileInput.value?.focus();
    return;
  }
  const ticket = revision;
  const id = 'new:' + crypto.randomUUID();
  closeNewFile(false);
  await openFile({
    id,
    path,
    revision: 0,
    assetId: '',
    mimeType: 'text/plain',
    byteSize: 0,
    sha256: '',
    url: ''
  });
  await nextTick();
  if (ticket === revision && active.value?.file.id === id && document.activeElement === document.body)
    selectedTab()?.focus({ preventScroll: true });
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
  if (!doc || !pending || saving.value || pending.text === doc.baseline) return;
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
const fileTabs = ref<HTMLElement | null>(null);
const selectedTab = () =>
  fileTabs.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
watch([activeKey, () => props.mode], async () => {
  await nextTick();
  selectedTab()?.closest('.file-tab')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
async function onFileTabKeydown(doc: Document, event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Delete'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Delete') await closeDocument(doc);
  else {
    const index = documents.value.findIndex((item) => item.key === doc.key);
    const last = documents.value.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + last + 1) % (last + 1);
    activeKey.value = documents.value[next].key;
  }
  await nextTick();
  selectedTab()?.focus({ preventScroll: true });
}
function toggleTree() {
  treeVisible.value = !treeVisible.value;
  try {
    localStorage.setItem('artigen-resource-tree-visible', String(treeVisible.value));
  } catch {}
}

defineExpose({ treeVisible, toggleTree });
const onOpenFile = (event: Event) => {
  const detail = (event as CustomEvent<WorkspaceFile>).detail;
  const found =
    files.value.find((f) => f.id === detail?.id) ||
    (detail?.assetId ? files.value.find((f) => f.assetId === detail.assetId) : undefined);
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
watch(() => props.mode, () => closeNewFile(false));
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
  () => [props.mode, activeKey.value, active.value?.text, active.value?.baseline, proposal.value?.text],
  async (_value, _previous, onCleanup) => {
    statistics.value = null;
    const doc = active.value;
    if (props.mode !== 'changes' || !doc || !hasChanges.value) return;
    let current = true;
    onCleanup(() => { current = false; });
    const a = doc.baseline,
      b = proposal.value?.text ?? doc.text ?? '';
    try {
      const { changedLineCounts } = await import('../../services/workspaceChanges');
      if (current) statistics.value = changedLineCounts(a, b);
    } catch {
      // Optional totals must not prevent reading or applying the comparison.
    }
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
.file-tabs-bar {
  display: flex;
  flex: none;
  min-width: 0;
  align-items: stretch;
  background: var(--sidebar);
}
.file-tabs {
  display: flex;
  align-items: center;
  min-height: 44px;
  overflow: auto;
  flex: 1;
  min-width: 0;
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
  padding: 0 8px;
  min-height: 34px;
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.file-tab.active > button {
  color: var(--text);
}
.file-tab > [role='tab'] {
  flex: 1;
}
.file-tab.active > [role='tab'] {
  font-weight: 500;
}
.file-tab-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-tab-dirty {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.file-tab > .file-tab-close {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  min-height: 28px;
  margin-right: 3px;
  padding: 0;
}
@media (hover: hover) and (pointer: fine) {
  .file-tab:not(.active):not(:hover):not(:focus-within) > .file-tab-close {
    opacity: 0;
  }
  .file-tab:hover:not(.active) {
    background: var(--surface-hover);
  }
  .file-tab > .file-tab-close:hover {
    color: var(--text);
    background: var(--surface);
  }
}
.tree-toggle {
  display: grid;
  place-items: center;
  flex: none;
  margin-left: auto;
  width: 36px;
  min-height: 36px;
  margin: 3px 5px;
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
.new-file-form {
  display: grid;
  flex: none;
  gap: 8px;
  max-height: 60%;
  overflow: auto;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.new-file-form > * { box-sizing: border-box; width: 100%; max-width: 440px; min-width: 0; }
.new-file-form h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; line-height: 1.5; }
.new-file-form label { font-size: 13px; line-height: 20px; }
.new-file-form input { min-height: 36px; border: 1px solid var(--border); border-radius: 7px; padding: 8px 10px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; }
.new-file-form p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--muted); overflow-wrap: anywhere; }
.new-file-form p[role="alert"] { color: var(--text); }
.new-file-actions { display: flex; gap: 8px; }
.new-file-actions button { min-height: 36px; padding: 8px 12px; border: 0; border-radius: 7px; background: transparent; color: var(--text); font-size: 13px; cursor: pointer; }
.new-file-actions button[type="submit"] { background: var(--surface-raised); }
.new-file-form input:focus-visible, .new-file-actions button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .new-file-actions button:hover { background: var(--surface-hover); }
}
@media (max-width: 799px), (pointer: coarse) {
  .new-file-form input { min-height: 44px; font-size: 16px; }
  .new-file-actions button { min-height: 44px; }
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
  padding: 12px;
  background: var(--sidebar);
  scrollbar-color: var(--border) transparent;
  border-inline-end: 1px solid var(--border);
}
.file-search {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
}
.file-search input {
  width: 100%;
  min-height: 28px;
  min-width: 0;
  background: transparent;
  color: var(--text);
  border: 0;
  outline: 0;
  font: inherit;
  font-size: 12px;
}
.file-search:focus-within { outline: 2px solid var(--focus); outline-offset: 1px; }
.file-search input:focus-visible { outline: 0; }
.file-search-clear {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
}
.file-search-clear:hover { color: var(--text); background: var(--surface-hover); }
.file-search-empty { display: grid; gap: 2px; margin: 8px 0 12px; }
.file-search-empty > span:first-child { color: var(--text); font-weight: 500; }
.tree-section-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 16px 0 6px;
  padding-inline: 4px;
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
.tree-section-heading button {
  min-width: 32px;
  min-height: 32px;
  padding: 0;
}
.tree-section-heading button:hover {
  color: var(--text);
  background: var(--surface-hover);
}
.tree-section-heading button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.resource-tree p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
  padding: 4px;
}
.local-root {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 28px;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 4px;
  font-size: 13px;
  font-weight: 500;
}
.local-root > .workspace-icon { color: var(--muted); }
.local-root-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.local-permission {
  display: grid;
  gap: 6px;
  min-width: 0;
  margin: 2px 4px 12px 26px;
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.local-permission strong { font-size: 13px; font-weight: 500; }
.resource-tree .local-permission p { margin: 0; padding: 0; }
.local-permission-action {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  max-width: calc(100% + 8px);
  min-height: 32px;
  margin-left: -8px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.local-permission-action:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.local-permission-action:active:not(:disabled) { background: var(--surface-hover); }
.local-root button {
  width: 28px;
  height: 28px;
  padding: 0;
}
@media (hover: hover) and (pointer: fine) {
  .local-root button:hover {
    color: var(--text);
    background: var(--surface-hover);
  }
  .local-permission-action:hover:not(:disabled) { background: var(--surface-hover); }
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
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  max-width: 100%;
  flex: 0 1 auto;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--surface-raised);
  overflow: hidden;
  white-space: nowrap;
  font-size: 12px;
  color: var(--muted);
}
.breadcrumb-source { flex: none; }
.breadcrumb-path { display: flex; min-width: 0; overflow: hidden; }
.breadcrumb-directory { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.breadcrumb-filename {
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
  font-weight: 500;
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
.view-mode-switch {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: var(--surface-hover);
}
.view-mode-switch > button {
  min-width: 48px;
  min-height: 28px;
  padding: 4px 10px;
  color: var(--muted);
  background: transparent;
  font-weight: 500;
}
.view-mode-switch > button[aria-pressed='true'] {
  color: var(--text);
  background: var(--surface);
  font-weight: 600;
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}
@media (hover: hover) and (pointer: fine) {
  .view-mode-switch > button:hover { color: var(--text); }
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.resource-empty {
  overflow: auto;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: safe center;
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
.file-read-content { display: grid; width: min(100%, 360px); min-width: 0; gap: 12px; text-align: left; }
.file-read-content > .workspace-icon { color: var(--muted); }
.file-read-error h2 { font-size: 15px; font-weight: 500; line-height: 1.5; }
.file-read-error p { max-width: none; overflow-wrap: anywhere; }
.file-read-error .file-read-name { color: var(--text); font-size: 13px; font-weight: 500; line-height: 1.5; }
.file-read-error .file-read-retry { justify-self: start; min-height: 36px; gap: 6px; padding: 7px 12px; background: var(--surface-raised); font-size: 13px; }
.file-read-retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) { .file-read-error .file-read-retry:hover { background: var(--surface-hover); } }
@media (max-width: 799px), (pointer: coarse) { .file-read-error .file-read-retry { min-height: 44px; } }
.binary-details {
  display: grid;
  width: min(100%, 360px);
  min-width: 0;
  gap: 14px;
  text-align: left;
}
.binary-details h2 {
  font-size: 15px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.binary-details p { max-width: none; }
.binary-properties { display: grid; gap: 8px; margin: 0; font-size: 12px; line-height: 1.6; }
.binary-properties > div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
.binary-properties dt { color: var(--muted); }
.binary-properties dd { min-width: 0; margin: 0; color: var(--text); text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.binary-details .binary-download { justify-self: start; gap: 6px; min-height: 36px; padding: 8px 12px; font-size: 13px; background: var(--surface-raised); }
.binary-download:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .binary-details .binary-download:hover { background: var(--surface-hover); }
}
@media (max-width: 799px), (pointer: coarse) {
  .binary-details .binary-download { min-height: 44px; }
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
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.image-preview-error { display: grid; grid-template-columns: 20px minmax(0, 1fr); align-items: start; gap: 12px; margin: 24px; text-align: left; }
.image-preview-error > .workspace-icon { margin-top: 1px; color: var(--muted); }
.image-preview-error h2 { margin: 0; color: var(--text); font-size: 15px; font-weight: 500; line-height: 22px; overflow-wrap: anywhere; }
.image-preview-error p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.image-controls {
  display: flex;
  flex: none;
  align-self: center;
  align-items: center;
  gap: 2px;
  margin: 12px 16px 0;
  padding: 3px;
  border-radius: 9px;
  background: var(--surface-hover);
}
.image-controls button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.image-controls .image-zoom-reset {
  width: 60px;
  font-variant-numeric: tabular-nums;
}
.image-controls button:hover:not(:disabled) {
  background: var(--surface);
}
.image-controls button:disabled {
  opacity: 0.4;
  cursor: default;
}
.image-canvas {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px;
}
.image-canvas img {
  display: block;
  max-height: none;
  object-fit: contain;
  margin: auto;
}
.file-status {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  margin-inline: 12px;
  padding: 6px 0;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--border);
}
.file-save-state {
  flex: none;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.file-status-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  max-width: 100%;
  margin-inline-start: auto;
}
.file-status button {
  padding: 4px 8px;
  color: var(--muted);
  background: transparent;
  font-size: 13px;
}
.file-version-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin: 0;
  padding-inline-start: 6px;
  white-space: nowrap;
}
.file-version-control select { min-width: 82px; max-width: 120px; }
@media (hover: hover) and (pointer: fine) {
  .file-status button:hover:not(:disabled) {
    color: var(--text);
    background: var(--surface-hover);
  }
}
.resource-notice {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 28px;
  align-items: start;
  gap: 10px;
  flex: none;
  min-width: 0;
  margin: 8px 12px;
  padding: 8px;
  border-radius: 8px;
  background: var(--surface-raised);
}
.resource-notice-icon { margin-top: 6px; color: var(--muted); }
.resource-notice p { min-width: 0; margin: 0; padding: 4px 0; color: var(--text); font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
.resource-notice-close { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; color: var(--muted); background: transparent; cursor: pointer; }
.resource-notice-close:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .resource-notice-close:hover { color: var(--text); background: var(--surface-hover); }
}
@media (max-width: 799px), (pointer: coarse) {
  .resource-notice { grid-template-columns: 16px minmax(0, 1fr) 44px; }
  .resource-notice-icon { margin-top: 14px; }
  .resource-notice p { padding-block: 12px; }
  .resource-notice-close { width: 44px; height: 44px; }
}
.resource-loading {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  min-width: 0;
  padding: 20px;
  font-size: 13px;
  color: var(--muted);
}
.resource-loading > .workspace-icon { margin-top: 3px; }
.resource-loading p { margin: 0; line-height: 1.6; overflow-wrap: anywhere; }
.resource-loading .resource-loading-name { margin-bottom: 4px; color: var(--text); font-weight: 500; }
.changes-panel {
  overflow: auto;
  overscroll-behavior: contain;
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}
.changes-panel > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 4px;
  font-size: 13px;
}
.changes-panel > header > b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.changes-panel > p {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  padding: 0 16px;
  line-height: 1.5;
}
.comparison-picker { display: grid; min-width: 0; gap: 8px; padding: 10px 16px; }
.comparison-picker label { color: var(--text); font-size: 13px; line-height: 20px; }
.comparison-picker :deep(.native-select-frame) { width: 100%; }
.comparison-picker select { width: 100%; }
.changes-panel > .workspace-code-editor {
  flex: 1 0 180px;
}
.changes-empty { display: flex; flex: 1; min-height: 160px; gap: 10px; align-items: flex-start; padding: 28px 16px; color: var(--muted); }
.changes-empty > div { min-width: 0; max-width: 400px; }
.changes-empty > .workspace-icon { margin-top: 1px; }
.changes-empty h2 { margin: 0; font-size: 15px; font-weight: 500; line-height: 1.5; color: var(--text); }
.changes-empty p { margin: 6px 0 0; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.change-actions {
  flex-wrap: wrap;
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
  border-inline-end: 0;
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
@media (max-width: 799px), (pointer: coarse) {
  .resource-tree {
    width: 175px;
  }
  .local-root { grid-template-columns: 16px minmax(0, 1fr) 44px; }
  .document-preview {
    padding: 16px;
  }
  .file-tab > button,
  .tree-toggle,
  .viewer-actions button,
  .file-status button,
  .tree-section-heading button,
  .image-viewer button,
  .local-root button,
  .local-permission-action,
  .file-status select,
  .file-search {
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
  .file-toolbar.is-comparison { flex-wrap: nowrap; align-items: center; }
  .file-toolbar.is-comparison .viewer-actions { width: auto; flex: none; }
  .file-viewer:has(.resource-empty) {
    min-width: 0;
  }
  .file-tabs {
    min-height: 48px;
  }
}
</style>
