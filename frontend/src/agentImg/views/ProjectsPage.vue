<template>
  <div class="projects-page">
    <TitleBar />
    <main class="projects-shell">
      <section class="projects-hero">
        <div>
          <p class="eyebrow">{{ zh ? '专业电商视觉工作台' : 'Commerce visual workspace' }}</p>
          <h1>{{ zh ? '把一套商品素材，做成一组可投放视觉' : 'Turn one product kit into a launch-ready visual set' }}</h1>
          <p>
            {{
              zh
                ? '商品图、品牌资料、生成版本、编辑与导出都留在同一个项目里。'
                : 'Keep product assets, brand rules, versions, editing, and exports in one project.'
              }}
          </p>
        </div>
        <button class="primary" type="button" @click="openComposer">
          {{ zh ? '创建商品视觉项目' : 'Create product visual project' }}
        </button>
      </section>

      <section v-if="composerOpen" class="composer-card" aria-labelledby="new-project-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ zh ? '新项目' : 'New project' }}</p>
            <h2 id="new-project-title">{{ zh ? '先写需求，确认生成时再登录' : 'Start the brief; sign in when you generate' }}</h2>
          </div>
          <button class="text-button" type="button" @click="composerOpen = false">
            {{ zh ? '收起' : 'Close' }}
          </button>
        </div>
        <div class="form-grid">
          <label>
            <span>{{ zh ? '项目名称' : 'Project name' }}</span>
            <input v-model.trim="draft.title" maxlength="160" :placeholder="zh ? '例如：秋季咖啡礼盒' : 'e.g. Autumn coffee gift set'" />
          </label>
          <label>
            <span>{{ zh ? '商品名称' : 'Product name' }}</span>
            <input v-model.trim="draft.productName" maxlength="160" :placeholder="zh ? '商品或 SKU 名称' : 'Product or SKU name'" />
          </label>
          <label class="full">
            <span>{{ zh ? '本次需求' : 'Creative brief' }}</span>
            <textarea v-model.trim="draft.brief" maxlength="4000" rows="4" :placeholder="zh ? '目标平台、受众、场景、必须保留的商品特征……' : 'Channel, audience, scene, and product details that must remain…'" />
          </label>
          <label class="upload full">
            <span>{{ zh ? '主商品图（可稍后补充）' : 'Hero product image (optional)' }}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" @change="pickProductFile" />
            <small v-if="draft.productFile">{{ draft.productFile.name }} · {{ formatBytes(draft.productFile.size) }}</small>
          </label>
        </div>
        <div class="composer-actions">
          <span class="status" role="status">{{ statusText }}</span>
          <button class="primary" type="button" :disabled="creating || !draft.title" @click="submitProject">
            {{ creating ? (zh ? '正在创建…' : 'Creating…') : (zh ? '进入项目工作台' : 'Open project workspace') }}
          </button>
        </div>
      </section>

      <section class="projects-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">{{ zh ? '项目' : 'Projects' }}</p>
            <h2>{{ zh ? '继续你的创作' : 'Continue creating' }}</h2>
          </div>
          <div v-if="isAuthed" class="list-actions">
            <button class="text-button" type="button" :disabled="loading" @click="toggleTrash">
              {{ showTrashed ? (zh ? '返回项目' : 'Active projects') : (zh ? '回收站' : 'Trash') }}
            </button>
            <button class="text-button" type="button" :disabled="loading" @click="loadProjects">
              {{ zh ? '刷新' : 'Refresh' }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="empty-state">{{ zh ? '正在加载项目…' : 'Loading projects…' }}</div>
        <div v-else-if="!isAuthed" class="empty-state">
          <strong>{{ zh ? '无需登录也能先写需求' : 'Draft without signing in' }}</strong>
          <span>{{ zh ? '项目同步、生成报价和长期资产保存需要登录。' : 'Sign in to sync projects, quote generations, and retain assets.' }}</span>
          <button class="secondary" type="button" @click="requestLogin">{{ zh ? '登录查看项目' : 'Sign in to view projects' }}</button>
        </div>
        <div v-else-if="!projects.length" class="empty-state">
          <strong>{{ zh ? '还没有项目' : 'No projects yet' }}</strong>
          <span>{{ zh ? '从一张商品图和一段需求开始。' : 'Start with one product image and a brief.' }}</span>
        </div>
        <div v-else class="project-grid">
          <article v-for="project in projects" :key="project.projectId" class="project-card">
            <router-link v-if="project.status !== 'trashed'" :to="`/artigen/projects/${project.projectId}`" class="cover">
              <img v-if="project.coverUrl" :src="assetUrl(project.coverUrl)" alt="" />
              <span v-else>{{ project.productName?.slice(0, 1) || project.title.slice(0, 1) }}</span>
            </router-link>
            <div v-else class="cover">
              <img v-if="project.coverUrl" :src="assetUrl(project.coverUrl)" alt="" />
              <span v-else>{{ project.productName?.slice(0, 1) || project.title.slice(0, 1) }}</span>
            </div>
            <div class="card-body">
              <p class="project-meta">{{ project.versionCount || 0 }} {{ zh ? '个版本' : 'versions' }}</p>
              <h3>{{ project.title }}</h3>
              <p>{{ project.productName || (zh ? '待补充商品资料' : 'Product details pending') }}</p>
              <div class="card-actions">
                <router-link v-if="project.status !== 'trashed'" :to="`/artigen/projects/${project.projectId}`" class="open-link">
                  {{ zh ? '打开工作台 →' : 'Open workspace →' }}
                </router-link>
                <button
                  v-if="project.status !== 'trashed'"
                  class="card-text-button"
                  type="button"
                  @click="moveToTrash(project)"
                >
                  {{ zh ? '移到回收站' : 'Move to trash' }}
                </button>
                <button v-else class="open-link card-text-button" type="button" @click="restoreFromTrash(project)">
                  {{ zh ? '恢复项目' : 'Restore project' }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { useLoginModel } from '@/stores';
import { getCurrentUserId, isLocalLoggedIn } from '@/login/session';
import { buildApiUrl } from '@/utils/api';
import { trackEvent } from '@/utils/analytics';
import TitleBar from '../components/TitleBar.vue';
import {
  createCreativeProject,
  importCreativeProjectVersion,
  listCreativeProjects,
  restoreCreativeProject,
  trashCreativeProject,
  uploadCreativeProjectAsset,
  type CreativeProject
} from '../services/creativeProjects';
import {
  clearCreativeProjectDraft,
  loadCreativeProjectDraft,
  saveCreativeProjectDraft
} from '../services/projectDraftDb';

const router = useRouter();
const route = useRoute();
const loginStore = useLoginModel();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const zh = computed(() => currentLang.value === 'zh');
const authRevision = ref(0);
const isAuthed = computed(() => {
  void authRevision.value;
  const userId = String(getCurrentUserId() || '');
  return Boolean(userId && !userId.startsWith('guest_') && isLocalLoggedIn());
});
const composerOpen = ref(false);
const creating = ref(false);
const loading = ref(false);
const statusText = ref('');
const projects = ref<CreativeProject[]>([]);
const showTrashed = ref(false);
const draft = reactive({
  title: '',
  productName: '',
  brief: '',
  productFile: null as File | null
});

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const assetUrl = (value: string) => value.startsWith('/api/') ? buildApiUrl(value) : value;
const sourceAssetId = computed(() => {
  const value = String(route.query.sourceAssetId || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : '';
});

const pickProductFile = (event: Event) => {
  const input = event.target as HTMLInputElement;
  draft.productFile = input.files?.[0] || null;
  void persistDraft();
};

const persistDraft = async () => {
  await saveCreativeProjectDraft({
    title: draft.title,
    productName: draft.productName,
    brief: draft.brief,
    productFile: draft.productFile
  });
};

const openComposer = () => {
  composerOpen.value = true;
  trackEvent('project_create_start', { authenticated: isAuthed.value });
};

const loadProjects = async () => {
  if (!isAuthed.value) return;
  loading.value = true;
  try {
    const all = await listCreativeProjects(showTrashed.value);
    projects.value = all.filter((project) => showTrashed.value
      ? project.status === 'trashed'
      : project.status !== 'trashed');
  } catch (error: any) {
    statusText.value = String(error?.code || '') === 'LOGIN_REQUIRED'
      ? (zh.value ? '请先登录' : 'Please sign in')
      : (zh.value ? '项目加载失败，请稍后重试' : 'Could not load projects. Try again.');
  } finally {
    loading.value = false;
  }
};

const toggleTrash = async () => {
  showTrashed.value = !showTrashed.value;
  await loadProjects();
};

const moveToTrash = async (project: CreativeProject) => {
  statusText.value = '';
  try {
    await trashCreativeProject(project.projectId);
    trackEvent('project_trashed', { projectId: project.projectId });
    await loadProjects();
  } catch {
    statusText.value = zh.value
      ? '暂时无法移到回收站，请检查网络后重试'
      : 'Could not move the project to trash. Check your connection and retry.';
  }
};

const restoreFromTrash = async (project: CreativeProject) => {
  statusText.value = '';
  try {
    await restoreCreativeProject(project.projectId);
    trackEvent('project_restored', { projectId: project.projectId });
    await loadProjects();
  } catch {
    statusText.value = zh.value
      ? '恢复失败；项目会继续保留在回收站，可稍后重试'
      : 'Restore failed. The project remains in trash so you can retry later.';
  }
};

const createFromDraft = async () => {
  if (!draft.title || creating.value) return;
  creating.value = true;
  statusText.value = '';
  try {
    const project = await createCreativeProject({
      title: draft.title,
      productName: draft.productName,
      brief: draft.brief
    });
    trackEvent('project_created', { projectId: project.projectId, hasProductImage: Boolean(draft.productFile) });
    if (draft.productFile) {
      await uploadCreativeProjectAsset(project.projectId, {
        file: draft.productFile,
        role: 'product'
      });
      trackEvent('project_reference_uploaded', { projectId: project.projectId, role: 'product' });
    }
    if (sourceAssetId.value) {
      await importCreativeProjectVersion(project.projectId, {
        assetId: sourceAssetId.value,
        prompt: draft.brief || draft.title,
        profileId: 'imported-history-v1'
      });
      trackEvent('project_version_reuse', {
        projectId: project.projectId,
        source: 'history',
        profileId: 'imported-history-v1'
      });
    }
    await clearCreativeProjectDraft();
    await router.push(`/artigen/projects/${project.projectId}`);
  } catch (error: any) {
    statusText.value = String(error?.code || '') === 'TASK_PAYLOAD_KEY_MISSING'
      ? (zh.value ? '服务端项目加密尚未配置' : 'Project encryption is not configured.')
      : (zh.value ? '创建失败，请检查资料后重试' : 'Could not create the project. Check the details and retry.');
  } finally {
    creating.value = false;
  }
};

const requestLogin = () => {
  loginStore.open({
    mode: 'login',
    returnTo: router.currentRoute.value.fullPath,
    afterLogin: async () => {
      authRevision.value += 1;
      await loadProjects();
    }
  });
};

const submitProject = async () => {
  await persistDraft();
  if (!isAuthed.value) {
    statusText.value = zh.value ? '草稿已安全保存在本机，登录后继续创建。' : 'Draft saved locally. Sign in to continue.';
    loginStore.open({
      mode: 'login',
      returnTo: router.currentRoute.value.fullPath,
      afterLogin: async () => {
        authRevision.value += 1;
        await createFromDraft();
      }
    });
    return;
  }
  await createFromDraft();
};

const handleAuthChanged = () => {
  authRevision.value += 1;
  void loadProjects();
};

onMounted(async () => {
  const saved = await loadCreativeProjectDraft();
  if (saved) {
    draft.title = saved.title;
    draft.productName = saved.productName;
    draft.brief = saved.brief;
    draft.productFile = saved.productFile || null;
    composerOpen.value = true;
    statusText.value = zh.value ? '已恢复上次未完成的本地草稿' : 'Restored your local draft.';
  }
  if (sourceAssetId.value) {
    composerOpen.value = true;
    statusText.value = zh.value
      ? '创建项目后，这张历史结果会自动保存为项目版本'
      : 'Create a project and the history result will be saved as a project version.';
  }
  await loadProjects();
  window.addEventListener('app-auth-changed', handleAuthChanged);
  trackEvent('projects_view', { authenticated: isAuthed.value });
});

onBeforeUnmount(() => window.removeEventListener('app-auth-changed', handleAuthChanged));
</script>

<style scoped>
.projects-page { min-height: 100vh; background: #080a0d; color: #f7f8f2; }
.projects-shell { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 56px 0 96px; }
.projects-hero { display: flex; justify-content: space-between; gap: 48px; align-items: end; padding: 48px; border: 1px solid #2a302d; border-radius: 28px; background: radial-gradient(circle at 82% 0, rgba(204,255,0,.16), transparent 34%), #111512; }
.projects-hero h1 { max-width: 760px; margin: 8px 0 14px; font-size: clamp(36px, 5vw, 68px); line-height: .98; letter-spacing: -.055em; }
.projects-hero p:not(.eyebrow) { max-width: 680px; color: #aeb7af; font-size: 17px; line-height: 1.7; }
.eyebrow { margin: 0; color: #ccff00; font-size: 12px; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
.primary,.secondary,.text-button { border: 0; cursor: pointer; font: inherit; font-weight: 800; }
.primary { flex: 0 0 auto; min-height: 48px; padding: 0 22px; border-radius: 14px; background: #ccff00; color: #111; }
.primary:disabled { opacity: .45; cursor: not-allowed; }
.secondary { padding: 11px 16px; border: 1px solid #3d493e; border-radius: 12px; background: #181d19; color: #fff; }
.text-button { background: none; color: #c9d0ca; }
.composer-card,.projects-section { margin-top: 28px; padding: 32px; border: 1px solid #242b26; border-radius: 24px; background: #101411; }
.section-heading { display: flex; justify-content: space-between; gap: 20px; align-items: start; margin-bottom: 26px; }
.section-heading h2 { margin: 5px 0 0; font-size: 26px; }
.list-actions,.card-actions { display: flex; align-items: center; gap: 14px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.form-grid label { display: grid; gap: 9px; color: #d8ded8; font-size: 13px; font-weight: 750; }
.form-grid .full { grid-column: 1 / -1; }
input,textarea { box-sizing: border-box; width: 100%; border: 1px solid #343c35; border-radius: 12px; outline: none; background: #080b09; color: #fff; font: inherit; padding: 13px 14px; }
input:focus,textarea:focus { border-color: #ccff00; box-shadow: 0 0 0 3px rgba(204,255,0,.1); }
textarea { resize: vertical; }
.upload small { color: #8e998f; font-weight: 500; }
.composer-actions { display: flex; justify-content: flex-end; align-items: center; gap: 18px; margin-top: 22px; }
.status { flex: 1; color: #f4c766; font-size: 13px; }
.project-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.project-card { overflow: hidden; border: 1px solid #293029; border-radius: 18px; background: #0b0e0c; }
.cover { display: grid; place-items: center; aspect-ratio: 4 / 3; overflow: hidden; background: #181f19; color: #ccff00; font-size: 56px; font-weight: 900; text-decoration: none; }
.cover img { width: 100%; height: 100%; object-fit: cover; }
.card-body { padding: 18px; }
.card-body h3 { margin: 5px 0 8px; font-size: 18px; }
.card-body > p:not(.project-meta) { min-height: 22px; margin: 0 0 16px; color: #929d94; }
.project-meta { margin: 0; color: #ccff00; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.open-link { color: #f5f6f2; font-size: 13px; font-weight: 800; text-decoration: none; }
.card-text-button { border: 0; padding: 0; background: none; color: #838d85; cursor: pointer; font: inherit; font-size: 12px; font-weight: 750; }
.empty-state { display: grid; justify-items: start; gap: 10px; padding: 42px; border: 1px dashed #343d35; border-radius: 16px; color: #919b93; }
.empty-state strong { color: #fff; font-size: 18px; }
@media (max-width: 900px) { .projects-hero { align-items: start; flex-direction: column; padding: 32px; } .project-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .projects-shell { width: min(100% - 24px, 1180px); padding-top: 24px; } .projects-hero,.composer-card,.projects-section { padding: 22px; border-radius: 18px; } .form-grid,.project-grid { grid-template-columns: 1fr; } .form-grid .full { grid-column: auto; } .composer-actions { align-items: stretch; flex-direction: column; } }
</style>
