<template>
  <div class="workspace-page">
    <TitleBar />
    <main v-if="project" class="project-shell">
      <header class="project-header">
        <div>
          <router-link to="/artigen/projects" class="back-link">← {{ zh ? '所有项目' : 'All projects' }}</router-link>
          <p class="eyebrow">{{ zh ? '商品视觉项目' : 'Product visual project' }}</p>
          <h1>{{ project.title }}</h1>
          <p>{{ project.productName || (zh ? '补充商品资料后开始生成' : 'Add product details to start generating') }}</p>
        </div>
        <div class="header-actions">
          <button class="secondary" type="button" @click="saveProject" :disabled="saving">
            {{ saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存资料' : 'Save details') }}
          </button>
          <button class="primary" type="button" @click="startGeneration()">
            {{ zh ? '生成新版本' : 'Generate a version' }}
          </button>
        </div>
      </header>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>

      <div class="project-layout">
        <aside class="project-sidebar">
          <section class="panel">
            <p class="eyebrow">{{ zh ? '项目资料' : 'Project brief' }}</p>
            <label>
              <span>{{ zh ? '项目名称' : 'Project name' }}</span>
              <input v-model.trim="form.title" maxlength="160" />
            </label>
            <label>
              <span>{{ zh ? '商品名称' : 'Product name' }}</span>
              <input v-model.trim="form.productName" maxlength="160" />
            </label>
            <label>
              <span>{{ zh ? '创意需求' : 'Creative brief' }}</span>
              <textarea v-model.trim="form.brief" maxlength="4000" rows="6" />
            </label>
          </section>

          <section class="panel">
            <p class="eyebrow">{{ zh ? '品牌资料' : 'Brand kit' }}</p>
            <label>
              <span>{{ zh ? '品牌名称' : 'Brand name' }}</span>
              <input v-model.trim="form.brandName" maxlength="120" />
            </label>
            <label>
              <span>{{ zh ? '品牌色（最多 6 个）' : 'Brand colors (up to 6)' }}</span>
              <div class="color-list">
                <input
                  v-for="(_, index) in form.colors"
                  :key="index"
                  v-model.trim="form.colors[index]"
                  maxlength="7"
                  placeholder="#CCFF00"
                />
                <button v-if="form.colors.length < 6" class="mini" type="button" @click="form.colors.push('#CCFF00')">+</button>
              </div>
            </label>
            <label>
              <span>{{ zh ? '风格关键词（逗号分隔）' : 'Style keywords (comma-separated)' }}</span>
              <input v-model="form.styleKeywords" :placeholder="zh ? '克制、高级、自然光' : 'minimal, premium, daylight'" />
            </label>
            <label>
              <span>{{ zh ? '禁用元素（逗号分隔）' : 'Prohibited elements' }}</span>
              <input v-model="form.prohibitedElements" :placeholder="zh ? '水印、人物、虚构文字' : 'watermarks, people, invented text'" />
            </label>
          </section>
        </aside>

        <div class="project-main">
          <section class="panel assets-panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">{{ zh ? '商品与品牌素材' : 'Product and brand assets' }}</p>
                <h2>{{ zh ? '语义参考图' : 'Semantic references' }}</h2>
              </div>
              <span>{{ zh ? '生成时按商品、风格、场景顺序使用' : 'Used in product, style, scene order' }}</span>
            </div>
            <div class="asset-grid">
              <article v-for="role in uploadRoles" :key="role.id" class="asset-slot">
                <div class="asset-preview">
                  <img v-if="firstAsset(role.id)" :src="assetUrl(firstAsset(role.id)!.url)" :alt="role.label" />
                  <span v-else>{{ role.short }}</span>
                </div>
                <strong>{{ role.label }}</strong>
                <small>{{ role.description }}</small>
                <label class="upload-button">
                  {{ firstAsset(role.id) ? (zh ? '替换/新增' : 'Replace/add') : (zh ? '上传' : 'Upload') }}
                  <input type="file" accept="image/png,image/jpeg,image/webp" @change="uploadAsset(role.id, $event)" />
                </label>
              </article>
            </div>
          </section>

          <section class="panel versions-panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">{{ zh ? '版本画廊' : 'Version gallery' }}</p>
                <h2>{{ zh ? '生成、分支、比较与交付' : 'Generate, branch, compare, deliver' }}</h2>
              </div>
              <button v-if="selectedVersions.length" class="secondary compact" type="button" @click="selectedVersions = []">
                {{ zh ? `清除对比（${selectedVersions.length}/4）` : `Clear compare (${selectedVersions.length}/4)` }}
              </button>
            </div>

            <div v-if="!versions.length" class="empty-state">
              <strong>{{ zh ? '第一个版本从商品参考图开始' : 'Start the first version from a product reference' }}</strong>
              <span>{{ zh ? '标准文生图 10 点；商品参考生成 60 点。' : 'Standard text generation is 10 credits; product reference is 60.' }}</span>
              <button class="primary" type="button" @click="startGeneration()">{{ zh ? '开始生成' : 'Start generating' }}</button>
            </div>
            <div v-else class="version-grid">
              <article
                v-for="version in versions"
                :key="version.versionId"
                class="version-card"
                :class="{ selected: selectedVersions.includes(version.versionId) }"
              >
                <div class="version-image">
                  <img v-if="version.outputUrl" :src="assetUrl(version.outputUrl)" alt="" />
                  <span v-else>{{ statusLabel(version.status) }}</span>
                  <button
                    class="compare-toggle"
                    type="button"
                    :disabled="!selectedVersions.includes(version.versionId) && selectedVersions.length >= 4"
                    @click="toggleCompare(version.versionId)"
                  >
                    {{ selectedVersions.includes(version.versionId) ? '✓' : '+' }}
                    {{ zh ? '对比' : 'Compare' }}
                  </button>
                  <button class="favorite" type="button" @click="toggleFavorite(version)">
                    {{ version.favorite ? '★' : '☆' }}
                  </button>
                </div>
                <div class="version-body">
                  <div class="version-meta">
                    <span>
                      {{
                        version.profileId === 'product-reference-v1'
                          ? (zh ? '商品参考' : 'Reference')
                          : version.profileId === 'imported-history-v1'
                            ? (zh ? '历史导入' : 'Imported')
                            : (zh ? '标准' : 'Standard')
                      }}
                    </span>
                    <span>{{ version.aspectRatio || '—' }}</span>
                    <span>{{ version.quotedCredits }} {{ zh ? '点' : 'credits' }}</span>
                  </div>
                  <p>{{ version.prompt || (zh ? '生成处理中' : 'Generation in progress') }}</p>
                  <small>
                    seed {{ version.seed ?? '—' }} · {{ formatDate(version.createdAt) }}
                    <template v-if="version.parentVersionId"> · {{ zh ? '分支版本' : 'branch' }}</template>
                  </small>
                  <div v-if="version.status === 'success'" class="version-actions">
                    <button type="button" @click="startGeneration(version)">{{ zh ? '再来一版' : 'New variation' }}</button>
                    <button type="button" @click="useAsReference(version, 'product')">{{ zh ? '商品参考' : 'Product ref' }}</button>
                    <button type="button" @click="useAsReference(version, 'style')">{{ zh ? '风格参考' : 'Style ref' }}</button>
                    <button type="button" @click="editVersion(version)">{{ zh ? '编辑' : 'Edit' }}</button>
                  </div>
                  <div v-if="version.status === 'success'" class="deliver-row">
                    <button v-for="preset in exportPresets" :key="preset.id" type="button" @click="exportVersion(version, preset)">
                      {{ preset.label }}
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section v-if="comparedVersions.length >= 2" class="panel compare-panel">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">{{ zh ? '并排对比' : 'Side-by-side compare' }}</p>
                <h2>{{ comparedVersions.length }} {{ zh ? '个版本' : 'versions' }}</h2>
              </div>
            </div>
            <div class="compare-grid" :style="{ gridTemplateColumns: `repeat(${comparedVersions.length}, minmax(0, 1fr))` }">
              <article v-for="version in comparedVersions" :key="version.versionId">
                <img v-if="version.outputUrl" :src="assetUrl(version.outputUrl)" alt="" />
                <strong>{{ version.aspectRatio }} · {{ version.quotedCredits }} {{ zh ? '点' : 'credits' }}</strong>
                <p>{{ version.prompt }}</p>
                <small>seed {{ version.seed ?? '—' }} · {{ formatDate(version.createdAt) }}</small>
              </article>
            </div>
          </section>
        </div>
      </div>
    </main>
    <main v-else class="loading-state">
      {{ loading ? (zh ? '正在加载项目…' : 'Loading project…') : notice }}
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import { buildApiUrl } from '@/utils/api';
import { resourceFetch } from '@/login/authFetch';
import { trackEvent } from '@/utils/analytics';
import TitleBar from '../components/TitleBar.vue';
import { createEditorTransfer } from '../services/toolTasks';
import {
  getCreativeProject,
  linkCreativeProjectAsset,
  setProjectVersionFavorite,
  updateCreativeProject,
  uploadCreativeProjectAsset,
  type CreativeProject,
  type CreativeProjectVersion,
  type ProjectAssetRole
} from '../services/creativeProjects';

const route = useRoute();
const router = useRouter();
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const zh = computed(() => currentLang.value === 'zh');
const projectId = computed(() => String(route.params.id || ''));
const project = ref<CreativeProject | null>(null);
const loading = ref(true);
const saving = ref(false);
const notice = ref('');
const selectedVersions = ref<string[]>([]);
const form = reactive({
  title: '',
  productName: '',
  brief: '',
  brandName: '',
  colors: ['#CCFF00', '#111111', '#FFFFFF'],
  styleKeywords: '',
  prohibitedElements: ''
});

const uploadRoles = computed(() => [
  { id: 'product' as ProjectAssetRole, short: 'P', label: zh.value ? '商品参考' : 'Product reference', description: zh.value ? '保持主体外观与结构' : 'Preserve product identity' },
  { id: 'style' as ProjectAssetRole, short: 'S', label: zh.value ? '风格参考' : 'Style reference', description: zh.value ? '统一色调、材质与构图' : 'Align tone and composition' },
  { id: 'scene' as ProjectAssetRole, short: 'C', label: zh.value ? '场景参考' : 'Scene reference', description: zh.value ? '指定环境与空间关系' : 'Guide environment and space' },
  { id: 'logo' as ProjectAssetRole, short: 'L', label: 'Logo', description: zh.value ? '品牌资料长期保留' : 'Retained in the brand kit' }
]);

const exportPresets = computed(() => [
  { id: '1x1', label: '1:1', width: 1200, height: 1200 },
  { id: '4x5', label: '4:5', width: 1200, height: 1500 },
  { id: '3x4', label: '3:4', width: 1200, height: 1600 },
  { id: '16x9', label: '16:9', width: 1600, height: 900 },
  { id: '9x16', label: '9:16', width: 1080, height: 1920 }
]);

const assets = computed(() => project.value?.assets || []);
const versions = computed(() => project.value?.versions || []);
const comparedVersions = computed(() =>
  selectedVersions.value.map((id) => versions.value.find((version) => version.versionId === id)).filter(Boolean) as CreativeProjectVersion[]
);
const firstAsset = (role: ProjectAssetRole) => assets.value.find((asset) => asset.role === role);
const assetUrl = (value: string) => value.startsWith('/api/') ? buildApiUrl(value) : value;
const listFromText = (value: string, max = 12) =>
  [...new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean))].slice(0, max);
const formatDate = (value: string) => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
}).format(new Date(value));
const statusLabel = (status: string) => ({
  pending: zh.value ? '生成中' : 'Generating',
  failed: zh.value ? '失败并退款' : 'Failed · refunded',
  cancelled: zh.value ? '已取消' : 'Cancelled'
}[status] || status);

const hydrateForm = (value: CreativeProject) => {
  form.title = value.title;
  form.productName = value.productName || '';
  form.brief = value.brief || '';
  form.brandName = value.brandProfile?.brandName || '';
  form.colors = value.brandProfile?.colors?.length
    ? [...value.brandProfile.colors]
    : ['#CCFF00', '#111111', '#FFFFFF'];
  form.styleKeywords = (value.brandProfile?.styleKeywords || []).join('，');
  form.prohibitedElements = (value.brandProfile?.prohibitedElements || []).join('，');
};

const loadProject = async () => {
  loading.value = true;
  try {
    project.value = await getCreativeProject(projectId.value);
    hydrateForm(project.value);
  } catch (error: any) {
    notice.value = String(error?.code || '') === 'LOGIN_REQUIRED'
      ? (zh.value ? '请先登录后查看项目' : 'Sign in to view this project.')
      : (zh.value ? '项目不存在或无权访问' : 'Project not found or inaccessible.');
  } finally {
    loading.value = false;
  }
};

const saveProject = async () => {
  if (!project.value || saving.value) return;
  saving.value = true;
  notice.value = '';
  try {
    const updated = await updateCreativeProject(projectId.value, {
      revision: project.value.revision,
      title: form.title,
      productName: form.productName,
      brief: form.brief,
      brandProfile: {
        brandName: form.brandName,
        colors: form.colors.filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 6),
        styleKeywords: listFromText(form.styleKeywords),
        prohibitedElements: listFromText(form.prohibitedElements),
        logoAssetId: firstAsset('logo')?.assetId || null
      }
    });
    project.value = { ...project.value, ...updated };
    notice.value = zh.value ? '项目资料已保存' : 'Project details saved.';
    trackEvent('project_updated', { projectId: projectId.value });
  } catch (error: any) {
    const code = String(error?.code || '');
    if (code === 'PROJECT_REVISION_CONFLICT') {
      await loadProject();
      notice.value = zh.value
        ? '资料已在别处更新，请确认后重试'
        : 'The project changed elsewhere. Review and retry.';
    } else if (code === 'INVALID_BRAND_COLOR' || code === 'INVALID_BRAND_COLOR_COUNT') {
      notice.value = zh.value
        ? '请填写 3–6 个有效的六位品牌色，例如 #CCFF00'
        : 'Enter 3–6 valid six-digit brand colors, such as #CCFF00.';
    } else {
      notice.value = zh.value ? '资料保存失败，请稍后重试' : 'Could not save the project. Try again.';
    }
  } finally {
    saving.value = false;
  }
};

const uploadAsset = async (role: ProjectAssetRole, event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  notice.value = zh.value ? '正在安全上传素材…' : 'Uploading asset securely…';
  try {
    await uploadCreativeProjectAsset(projectId.value, { file, role });
    await loadProject();
    notice.value = zh.value ? '素材已加入项目' : 'Asset added to the project.';
    trackEvent('project_reference_uploaded', { projectId: projectId.value, role });
  } catch {
    notice.value = zh.value ? '素材上传失败，请检查图片格式和大小' : 'Upload failed. Check the file type and size.';
  }
};

const startGeneration = (version?: CreativeProjectVersion) => {
  const productAsset = firstAsset('product');
  const referenceAssets = productAsset
    ? [productAsset, firstAsset('style'), firstAsset('scene')].filter(Boolean)
    : [];
  const query: Record<string, string> = {
    projectId: projectId.value,
    profileId: referenceAssets.length ? 'product-reference-v1' : 'standard-v1'
  };
  if (version) {
    query.parentVersionId = version.versionId;
    query.prompt = version.prompt;
  }
  if (referenceAssets.length) {
    window.localStorage.setItem('agentImg:prefillRef_v1', JSON.stringify({
      items: referenceAssets.map((asset) => ({ kind: 'url', value: asset!.url }))
    }));
  }
  trackEvent(version ? 'project_version_reuse' : 'project_generation_start', {
    projectId: projectId.value,
    parentVersionId: version?.versionId || '',
    profileId: query.profileId
  });
  void router.push({ path: '/artigen/ai', query });
};

const toggleCompare = (versionId: string) => {
  selectedVersions.value = selectedVersions.value.includes(versionId)
    ? selectedVersions.value.filter((id) => id !== versionId)
    : [...selectedVersions.value, versionId].slice(0, 4);
  trackEvent('project_version_compare', { projectId: projectId.value, count: selectedVersions.value.length });
};

const toggleFavorite = async (version: CreativeProjectVersion) => {
  try {
    await setProjectVersionFavorite(projectId.value, version.versionId, !version.favorite);
    version.favorite = !version.favorite;
    trackEvent('project_version_favorite', { projectId: projectId.value, favorite: version.favorite });
  } catch {
    notice.value = zh.value ? '收藏状态同步失败，请稍后重试' : 'Could not sync the favorite. Try again.';
  }
};

const useAsReference = async (version: CreativeProjectVersion, role: 'product' | 'style') => {
  if (!version.outputAssetId || !version.outputUrl) return;
  const productReference = role === 'product'
    ? { url: version.outputUrl }
    : firstAsset('product');
  if (!productReference) {
    notice.value = zh.value
      ? '请先上传商品参考图，再把该版本作为风格参考'
      : 'Add a product reference before using this version as style guidance.';
    return;
  }
  try {
    await linkCreativeProjectAsset(projectId.value, {
      assetId: version.outputAssetId,
      role
    });
  } catch {
    notice.value = zh.value
      ? '无法把这个版本设为参考图，请稍后重试'
      : 'Could not reuse this version as a reference. Try again.';
    return;
  }
  const styleReference = role === 'style' ? { url: version.outputUrl } : firstAsset('style');
  const sceneReference = firstAsset('scene');
  window.localStorage.setItem('agentImg:prefillRef_v1', JSON.stringify({
    items: [productReference, styleReference, sceneReference]
      .filter(Boolean)
      .map((asset) => ({ kind: 'url', value: asset!.url }))
  }));
  trackEvent('project_version_reuse', { projectId: projectId.value, versionId: version.versionId, role });
  await router.push({
    path: '/artigen/ai',
    query: {
      projectId: projectId.value,
      parentVersionId: version.versionId,
      profileId: 'product-reference-v1',
      prompt: version.prompt
    }
  });
};

const editVersion = async (version: CreativeProjectVersion) => {
  if (!version.outputAssetId) return;
  try {
    const transferId = await createEditorTransfer(version.outputAssetId);
    trackEvent('project_edit_open', { projectId: projectId.value, versionId: version.versionId });
    trackEvent('edit', {
      operation: 'generate',
      source: 'workspace',
      projectId: projectId.value,
      taskId: version.taskId || undefined,
      profileId: version.profileId
    });
    await router.push({
      path: '/artigen/image-workshop/image-editor',
      query: {
        transferId,
        editor: 'v2',
        projectId: projectId.value,
        sourceVersionId: version.versionId
      }
    });
  } catch {
    notice.value = zh.value ? '无法安全打开编辑器，请稍后重试' : 'Could not open the editor securely.';
  }
};

const canvasBlob = (canvas: HTMLCanvasElement, type = 'image/png') =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, .94));

const exportVersion = async (
  version: CreativeProjectVersion,
  preset: { id: string; label: string; width: number; height: number }
) => {
  if (!version.outputUrl) return;
  notice.value = zh.value ? `正在生成 ${preset.label} 交付图…` : `Creating ${preset.label} deliverable…`;
  try {
    const response = await resourceFetch(assetUrl(version.outputUrl));
    if (!response.ok) throw new Error('ASSET_DOWNLOAD_FAILED');
    const sourceBlob = await response.blob();
    const bitmap = await createImageBitmap(sourceBlob);
    const canvas = document.createElement('canvas');
    canvas.width = preset.width;
    canvas.height = preset.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    context.drawImage(bitmap, Math.round((canvas.width - width) / 2), Math.round((canvas.height - height) / 2), width, height);
    bitmap.close();
    const output = await canvasBlob(canvas);
    if (!output) throw new Error('EXPORT_FAILED');
    const file = new File([output], `artigen-${project.value?.title || 'project'}-${preset.id}.png`, { type: 'image/png' });
    await uploadCreativeProjectAsset(projectId.value, {
      file,
      role: 'export',
      label: `${preset.label} · ${version.versionId}`
    });
    const objectUrl = URL.createObjectURL(output);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
    await loadProject();
    notice.value = zh.value ? `${preset.label} 已下载并记录到项目` : `${preset.label} downloaded and recorded.`;
    trackEvent('project_export', { projectId: projectId.value, versionId: version.versionId, preset: preset.id });
    trackEvent('download', {
      operation: 'generate',
      source: 'workspace',
      projectId: projectId.value,
      taskId: version.taskId || undefined,
      profileId: version.profileId
    });
  } catch {
    notice.value = zh.value ? '交付图生成失败，请稍后重试' : 'Could not create the deliverable.';
  }
};

onMounted(async () => {
  await loadProject();
  trackEvent('project_workspace_view', { projectId: projectId.value });
});
</script>

<style scoped>
.workspace-page { min-height: 100vh; background: #080a0d; color: #f7f8f2; }
.project-shell { width: min(1400px, calc(100% - 40px)); margin: 0 auto; padding: 34px 0 90px; }
.project-header { display: flex; justify-content: space-between; gap: 32px; align-items: end; padding: 26px 4px 34px; }
.project-header h1 { margin: 5px 0 8px; font-size: clamp(34px, 4vw, 56px); letter-spacing: -.045em; }
.project-header p:not(.eyebrow) { margin: 0; color: #99a49c; }
.back-link { display: inline-block; margin-bottom: 20px; color: #b8c1ba; text-decoration: none; }
.eyebrow { margin: 0; color: #ccff00; font-size: 11px; font-weight: 850; letter-spacing: .15em; text-transform: uppercase; }
.header-actions { display: flex; gap: 10px; }
button { font: inherit; cursor: pointer; }
.primary,.secondary { min-height: 44px; padding: 0 17px; border-radius: 12px; font-weight: 850; }
.primary { border: 0; background: #ccff00; color: #10120f; }
.secondary { border: 1px solid #3a443b; background: #151a16; color: #fff; }
.compact { min-height: 36px; font-size: 12px; }
.notice { position: sticky; top: 74px; z-index: 5; margin: 0 0 16px; padding: 11px 15px; border: 1px solid #4d593a; border-radius: 12px; background: #1b2117; color: #e5f4ba; }
.project-layout { display: grid; grid-template-columns: 310px minmax(0, 1fr); gap: 18px; align-items: start; }
.project-sidebar { display: grid; gap: 18px; position: sticky; top: 84px; }
.project-main { display: grid; gap: 18px; min-width: 0; }
.panel { padding: 22px; border: 1px solid #262d27; border-radius: 18px; background: #101411; }
.panel label { display: grid; gap: 7px; margin-top: 16px; color: #c7cec8; font-size: 12px; font-weight: 750; }
input,textarea { box-sizing: border-box; width: 100%; border: 1px solid #333b34; border-radius: 10px; outline: 0; background: #080b09; color: #fff; padding: 11px 12px; font: inherit; }
input:focus,textarea:focus { border-color: #ccff00; }
textarea { resize: vertical; }
.color-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px; }
.mini { border: 1px dashed #566157; border-radius: 9px; background: transparent; color: #ccff00; }
.panel-heading { display: flex; justify-content: space-between; gap: 24px; align-items: start; margin-bottom: 20px; }
.panel-heading h2 { margin: 5px 0 0; font-size: 24px; }
.panel-heading > span { color: #879188; font-size: 12px; }
.asset-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.asset-slot { min-width: 0; padding: 12px; border: 1px solid #2c342d; border-radius: 14px; background: #0a0d0b; }
.asset-preview { display: grid; place-items: center; overflow: hidden; aspect-ratio: 1; margin-bottom: 12px; border-radius: 10px; background: #192019; color: #ccff00; font-size: 36px; font-weight: 900; }
.asset-preview img { width: 100%; height: 100%; object-fit: cover; }
.asset-slot strong,.asset-slot small { display: block; }
.asset-slot small { min-height: 34px; margin: 5px 0 12px; color: #808a82; line-height: 1.4; }
.upload-button { display: block; padding: 8px; border: 1px solid #3c463d; border-radius: 9px; text-align: center; cursor: pointer; }
.upload-button input { display: none; }
.version-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.version-card { overflow: hidden; border: 1px solid #2b322c; border-radius: 16px; background: #090c0a; }
.version-card.selected { border-color: #ccff00; box-shadow: 0 0 0 2px rgba(204,255,0,.12); }
.version-image { position: relative; display: grid; place-items: center; aspect-ratio: 1; background: #171c18; color: #98a099; }
.version-image img { width: 100%; height: 100%; object-fit: cover; }
.compare-toggle,.favorite { position: absolute; border: 1px solid rgba(255,255,255,.2); background: rgba(8,10,9,.84); color: #fff; }
.compare-toggle { left: 9px; bottom: 9px; padding: 7px 9px; border-radius: 9px; font-size: 11px; }
.favorite { top: 9px; right: 9px; width: 34px; height: 34px; border-radius: 50%; color: #ccff00; font-size: 19px; }
.version-body { padding: 14px; }
.version-meta { display: flex; flex-wrap: wrap; gap: 5px; }
.version-meta span { padding: 4px 6px; border-radius: 6px; background: #1b211c; color: #c8d0ca; font-size: 10px; font-weight: 800; }
.version-body > p { min-height: 58px; margin: 12px 0 7px; color: #d7dcd7; font-size: 12px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.version-body > small { color: #727d74; font-size: 10px; }
.version-actions,.deliver-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.version-actions button,.deliver-row button { padding: 7px 8px; border: 1px solid #343d35; border-radius: 8px; background: #141915; color: #fff; font-size: 10px; font-weight: 750; }
.deliver-row { padding-top: 10px; border-top: 1px solid #242a25; }
.deliver-row button { color: #ccff00; }
.empty-state { display: grid; justify-items: start; gap: 10px; padding: 38px; border: 1px dashed #374038; border-radius: 14px; color: #8f9991; }
.empty-state strong { color: #fff; font-size: 17px; }
.compare-grid { display: grid; gap: 12px; overflow-x: auto; }
.compare-grid article { min-width: 190px; }
.compare-grid img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; }
.compare-grid strong { display: block; margin: 10px 0 6px; font-size: 12px; }
.compare-grid p { min-height: 56px; color: #aab3ac; font-size: 11px; line-height: 1.5; }
.compare-grid small { color: #737d75; font-size: 10px; }
.loading-state { min-height: 60vh; display: grid; place-items: center; background: #080a0d; color: #aab4ab; }
@media (max-width: 1150px) { .project-layout { grid-template-columns: 260px minmax(0, 1fr); } .asset-grid { grid-template-columns: repeat(2, 1fr); } .version-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 800px) { .project-shell { width: min(100% - 24px, 1400px); } .project-header,.panel-heading { flex-direction: column; align-items: stretch; } .project-layout { grid-template-columns: 1fr; } .project-sidebar { position: static; } }
@media (max-width: 520px) { .header-actions { flex-direction: column; } .asset-grid,.version-grid { grid-template-columns: 1fr; } .panel { padding: 16px; } }
</style>
