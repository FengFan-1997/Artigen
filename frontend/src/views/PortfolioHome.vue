<template>
  <div class="portfolio-container">
    <!-- Universe Background -->
    <UniverseBackground ref="universeRef" :mode="config.mode" />

    <!-- Custom Cursor -->
    <CustomCursor />

    <!-- Scroll Progress -->
    <ScrollProgress />

    <!-- Social Links -->
    <SocialLinks :is-pinned="isPinned" @toggle-pin="isPinned = !isPinned" />

    <!-- Config Panel -->
    <ConfigPanel v-model="config.mode" class="desktop-config-panel" />

    <!-- Agent Toggle -->
    <div
      class="agent-toggle"
      :class="{ active: showAgent }"
      @click="openAgentSettings"
      title="Agent Settings"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    </div>

    <!-- Language Switcher -->
    <div class="lang-switch">
      <span :class="{ active: currentLang === 'en' }" @click.stop="setLanguage('en')">EN</span>
      <span class="divider">/</span>
      <span :class="{ active: currentLang === 'zh' }" @click.stop="setLanguage('zh')">CN</span>
    </div>

    <!-- Sidebar Navigation -->
    <Sidebar>
      <template #mobile-header-extra>
        <ConfigPanel v-model="config.mode" :embedded="true" />
      </template>
    </Sidebar>

    <main class="content-flow">
      <!-- Hero Section -->
      <HeroSection id="hero" />

      <!-- Projects Section -->
      <ProjectsSection
        id="projects"
        @hover-start="onHoverStart"
        @hover-end="onHoverEnd"
        @navigate="handleNavigation"
      />

      <!-- About Section -->
      <AboutSection id="about" />

      <!-- Skills Section -->
      <SkillsSection id="skills" />

      <!-- Experience Section -->
      <ExperienceSection id="experience" />

      <!-- Testimonials Section -->
      <TestimonialsSection id="testimonials" />

      <!-- Footer Section -->
      <FooterSection />
    </main>

    <!-- Live2D Agent Widget -->
    <Agent v-if="showAgent" :is-pinned="isPinned" />

    <Teleport to="body">
      <transition name="agent-settings-fade">
        <div
          v-if="agentSettingsOpen"
          class="agent-settings-overlay"
          @click.self="agentSettingsOpen = false"
        >
          <div class="agent-settings-modal">
            <div class="agent-settings-head">
              <div class="agent-settings-title">Agent 设置</div>
              <button class="agent-settings-close" type="button" @click="agentSettingsOpen = false">
                ×
              </button>
            </div>

            <div class="agent-settings-body">
              <div class="agent-settings-row">
                <div class="agent-settings-label">显示 Agent</div>
                <label class="agent-switch">
                  <input type="checkbox" v-model="showAgent" />
                  <span class="agent-switch-ui"></span>
                </label>
              </div>

              <div class="agent-settings-row">
                <div class="agent-settings-label">跟随鼠标移动</div>
                <label class="agent-switch">
                  <input
                    type="checkbox"
                    :checked="agentSettings.mouseFollowEnabled"
                    @change="onToggleMouseFollow"
                  />
                  <span class="agent-switch-ui"></span>
                </label>
              </div>

              <div class="agent-settings-row">
                <div class="agent-settings-label">模型类型</div>
                <select
                  class="agent-settings-select"
                  :value="agentSettings.agentType"
                  :disabled="agentSettings.isExecuting"
                  @change="onChangeAgentType"
                >
                  <option value="vrm">VRM</option>
                  <option value="cubism3">Live2D C3</option>
                </select>
              </div>

              <div class="agent-settings-row">
                <div class="agent-settings-label">VRM 模型</div>
                <select
                  class="agent-settings-select"
                  :value="agentSettings.vrmModelIndex"
                  :disabled="
                    agentSettings.isExecuting ||
                    agentSettings.agentType !== 'vrm' ||
                    !agentSettings.hasVrmSupport ||
                    agentSettings.vrmListLoading
                  "
                  @change="onChangeVrmModelIndex"
                >
                  <option v-if="agentSettings.vrmListLoading" value="0">加载中…</option>
                  <option v-for="(m, idx) in agentSettings.vrmModels" :key="m.path" :value="idx">
                    {{ m.name }}
                  </option>
                </select>
              </div>

              <div v-if="agentSettings.vrmListError" class="agent-settings-error">
                {{ agentSettings.vrmListError }}
              </div>

              <div class="agent-settings-actions">
                <button
                  class="agent-settings-btn"
                  type="button"
                  :disabled="!showAgent"
                  @click="requestAgentSettingsState"
                >
                  刷新
                </button>
              </div>

              <div v-if="agentSettings.isExecuting" class="agent-settings-hint">
                任务执行中：已锁定模型切换相关选项
              </div>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import gsap from 'gsap';
import { useLanguageStore } from '../stores/language';
import { storeToRefs } from 'pinia';

// Components
import UniverseBackground from '../components/UniverseBackground.vue';
import CustomCursor from '../components/CustomCursor.vue';
import ScrollProgress from '../components/ScrollProgress.vue';
import SocialLinks from '../components/SocialLinks.vue';
import ConfigPanel from '../components/ConfigPanel.vue';
import Sidebar from '../components/Sidebar.vue';
import HeroSection from '../components/HeroSection.vue';
import ProjectsSection from '../components/ProjectsSection.vue';
import AboutSection from '../components/AboutSection.vue';
import SkillsSection from '../components/SkillsSection.vue';
import ExperienceSection from '../components/ExperienceSection.vue';
import TestimonialsSection from '../components/TestimonialsSection.vue';
import FooterSection from '../components/FooterSection.vue';
import Agent from '../agent/components/Agent.vue';

const router = useRouter();
const universeRef = ref<InstanceType<typeof UniverseBackground> | null>(null);
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const { setLanguage } = languageStore;

const showAgent = ref(true);
const isPinned = ref(false);
const agentSettingsOpen = ref(false);

type AgentType = 'cubism3' | 'vrm';
type VrmModelItem = { name: string; path: string; source: 'hf' | 'local' };

const AGENT_SETTINGS_REQUEST_EVENT = 'agent_settings_request';
const AGENT_SETTINGS_UPDATE_EVENT = 'agent_settings_update';
const AGENT_SETTINGS_STATE_EVENT = 'agent_settings_state';
const AGENT_TYPE_KEY = 'agent_type_v1';
const MOUSE_FOLLOW_ENABLED_KEY = 'agent_mouse_follow_enabled';
const VRM_MODEL_INDEX_KEY = 'agent_vrm_model_index_v1';
const VRM_MODEL_PATH_KEY = 'agent_vrm_model_path_v1';

const agentSettings = reactive({
  agentType: 'vrm' as AgentType,
  mouseFollowEnabled: false,
  isExecuting: false,
  hasVrmSupport: false,
  vrmModelIndex: 0,
  vrmModels: [] as VrmModelItem[],
  vrmListLoading: false,
  vrmListError: '',
  vrmPreferLocalRuntime: false
});

const readBool = (key: string, fallback: boolean) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = raw.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    return fallback;
  } catch {
    return fallback;
  }
};

const syncAgentSettingsFromLocal = () => {
  agentSettings.agentType = 'vrm';
  try {
    localStorage.setItem(AGENT_TYPE_KEY, 'vrm');
  } catch {}
  agentSettings.mouseFollowEnabled = readBool(MOUSE_FOLLOW_ENABLED_KEY, false);
  try {
    const rawIdx = localStorage.getItem(VRM_MODEL_INDEX_KEY);
    const idx = rawIdx ? Number.parseInt(rawIdx, 10) : Number.NaN;
    if (Number.isFinite(idx) && idx >= 0) agentSettings.vrmModelIndex = idx;
  } catch {}
};

const requestAgentSettingsState = () => {
  if (!showAgent.value) return;
  window.dispatchEvent(new Event(AGENT_SETTINGS_REQUEST_EVENT));
};

const openAgentSettings = async () => {
  syncAgentSettingsFromLocal();
  agentSettingsOpen.value = true;
  await nextTick();
  requestAgentSettingsState();
};

const dispatchAgentSettingsUpdate = (detail: any) => {
  try {
    window.dispatchEvent(new CustomEvent(AGENT_SETTINGS_UPDATE_EVENT, { detail }));
  } catch {}
};

const onToggleMouseFollow = (event: Event) => {
  const enabled =
    event.target instanceof HTMLInputElement
      ? event.target.checked
      : agentSettings.mouseFollowEnabled;
  agentSettings.mouseFollowEnabled = enabled;
  try {
    localStorage.setItem(MOUSE_FOLLOW_ENABLED_KEY, enabled ? '1' : '0');
  } catch {}
  if (showAgent.value) dispatchAgentSettingsUpdate({ mouseFollowEnabled: enabled });
};

const onChangeAgentType = (event: Event) => {
  const next =
    event.target instanceof HTMLSelectElement ? event.target.value : agentSettings.agentType;
  const v = next.trim().toLowerCase();
  if (v !== 'cubism3' && v !== 'vrm') return;
  agentSettings.agentType = v as AgentType;
  try {
    localStorage.setItem(AGENT_TYPE_KEY, v);
  } catch {}
  if (showAgent.value) dispatchAgentSettingsUpdate({ agentType: v });
};

const onChangeVrmModelIndex = (event: Event) => {
  const raw =
    event.target instanceof HTMLSelectElement
      ? event.target.value
      : String(agentSettings.vrmModelIndex);
  const idx = Number.parseInt(raw, 10);
  const next = Number.isFinite(idx)
    ? Math.max(0, Math.min(idx, agentSettings.vrmModels.length - 1))
    : 0;
  agentSettings.vrmModelIndex = next;
  try {
    localStorage.setItem(VRM_MODEL_INDEX_KEY, String(next));
    const item = agentSettings.vrmModels[next];
    if (item?.path)
      localStorage.setItem(
        VRM_MODEL_PATH_KEY,
        `${item.source === 'local' ? 'local:' : 'hf:'}${item.path}`
      );
  } catch {}
  if (showAgent.value) dispatchAgentSettingsUpdate({ vrmModelIndex: next });
};

const config = reactive({
  mode: '0' // 0: Ripple, 1: Kaleidoscope, 2: Starburst
});

const onHoverStart = () => {
  // Trigger subtle effect on hover
  universeRef.value?.triggerEffect(0.5);
};

const onHoverEnd = () => {
  // Optional logic
};

const handleNavigation = (route: string) => {
  if (route === '#') return;

  // Exit animation
  const tl = gsap.timeline({
    onComplete: () => {
      router.push(route);
    }
  });

  tl.to('.content-flow', { opacity: 0, y: -50, duration: 0.5 });

  // Trigger strong effect on navigation
  universeRef.value?.triggerEffect(5.0);
};

const handleAgentSettingsState = (event: Event) => {
  const detail = (event as CustomEvent).detail || {};
  if (typeof detail.agentType === 'string') {
    const v = detail.agentType.trim().toLowerCase();
    if (v === 'cubism3' || v === 'vrm') agentSettings.agentType = v as AgentType;
  }
  if (typeof detail.mouseFollowEnabled === 'boolean')
    agentSettings.mouseFollowEnabled = detail.mouseFollowEnabled;
  agentSettings.isExecuting = !!detail.isExecuting;
  agentSettings.hasVrmSupport = !!detail.hasVrmSupport;
  agentSettings.vrmModelIndex =
    typeof detail.vrmModelIndex === 'number' ? detail.vrmModelIndex : agentSettings.vrmModelIndex;
  agentSettings.vrmModels = Array.isArray(detail.vrmModels) ? detail.vrmModels : [];
  agentSettings.vrmListLoading = !!detail.vrmListLoading;
  agentSettings.vrmListError = typeof detail.vrmListError === 'string' ? detail.vrmListError : '';
  agentSettings.vrmPreferLocalRuntime = !!detail.vrmPreferLocalRuntime;
};

onMounted(() => {
  syncAgentSettingsFromLocal();
  window.addEventListener(AGENT_SETTINGS_STATE_EVENT, handleAgentSettingsState as any);
});

onBeforeUnmount(() => {
  window.removeEventListener(AGENT_SETTINGS_STATE_EVENT, handleAgentSettingsState as any);
});

watch(
  () => showAgent.value,
  async (v) => {
    if (!v) return;
    await nextTick();
    requestAgentSettingsState();
  }
);
</script>

<style scoped>
:root {
  --bg-color: #0f172a;
  --text-main: #f1f5f9;
  --text-secondary: #cbd5e1;
  --accent-color: #38bdf8;
  --accent-glow: rgba(56, 189, 248, 0.3);
  --card-bg: rgba(30, 41, 59, 0.7);
  --border-color: rgba(255, 255, 255, 0.15);
}

.portfolio-container {
  width: 100%;
  height: 100vh;
  overflow-y: scroll; /* Force scroll behavior but hide bar */
  overflow-x: hidden;
  position: relative;
  background-color: #050505;
  background-image: radial-gradient(circle at 50% 50%, #111827 0%, #000000 100%);
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--text-main);
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.portfolio-container::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
  width: 0;
  height: 0;
}

.content-flow {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.lang-switch {
  position: fixed;
  top: 20px;
  right: 24px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  backdrop-filter: blur(8px);
}

.lang-switch span {
  font-size: 0.85rem;
  color: #94a3b8;
}

.lang-switch .divider {
  color: #475569;
}

.lang-switch .active {
  color: #38bdf8;
}

@media (max-width: 980px) {
  .lang-switch {
    top: 16px;
    right: 16px;
    padding: 6px 10px;
    gap: 6px;
  }
}

.agent-toggle {
  position: fixed;
  top: 20px;
  right: 120px;
  z-index: 60;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  cursor: pointer;
  color: #94a3b8;
  backdrop-filter: blur(8px);
  transition: all 0.3s ease;
}

.agent-toggle:hover {
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.3);
}

.agent-toggle.active {
  color: #38bdf8;
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.2);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
}

.agent-settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.agent-settings-modal {
  width: 100%;
  max-width: 420px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #e2e8f0;
  box-shadow: 0 30px 120px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.agent-settings-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.agent-settings-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.agent-settings-close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: rgba(226, 232, 240, 0.95);
  cursor: pointer;
  line-height: 1;
  font-size: 18px;
}

.agent-settings-close:hover {
  background: rgba(255, 255, 255, 0.08);
}

.agent-settings-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.agent-settings-label {
  font-size: 13px;
  color: rgba(226, 232, 240, 0.9);
}

.agent-settings-select {
  flex: 0 0 180px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(2, 6, 23, 0.35);
  color: rgba(226, 232, 240, 0.95);
  padding: 0 34px 0 10px;
  outline: none;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24'%3E%3Cpath fill='rgba(226,232,240,0.85)' d='M7 10l5 5l5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 14px 14px;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    box-shadow 0.18s ease;
}

.agent-settings-select:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.28);
  background-color: rgba(2, 6, 23, 0.45);
}

.agent-settings-select:focus-visible {
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
}

.agent-settings-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.agent-switch {
  position: relative;
  width: 46px;
  height: 26px;
  display: inline-flex;
  align-items: center;
}

.agent-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.agent-switch-ui {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(2, 6, 23, 0.35);
  transition: all 0.18s ease;
}

.agent-switch-ui::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.92);
  transition: all 0.18s ease;
}

.agent-switch input:checked + .agent-switch-ui {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.45);
}

.agent-switch input:checked + .agent-switch-ui::after {
  transform: translateX(20px);
  background: rgba(255, 255, 255, 0.95);
}

.agent-settings-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}

.agent-settings-btn {
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(2, 6, 23, 0.35);
  color: rgba(226, 232, 240, 0.95);
  cursor: pointer;
}

.agent-settings-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.agent-settings-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
}

.agent-settings-error {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.08);
  color: rgba(254, 202, 202, 0.95);
  font-size: 12px;
}

.agent-settings-hint {
  color: rgba(226, 232, 240, 0.7);
  font-size: 12px;
}

.agent-settings-fade-enter-active,
.agent-settings-fade-leave-active {
  transition: opacity 0.18s ease;
}

.agent-settings-fade-enter-from,
.agent-settings-fade-leave-to {
  opacity: 0;
}

@media (max-width: 980px) {
  .agent-toggle {
    top: 16px;
    right: 100px;
    width: 36px;
    height: 36px;
  }
}

@media (max-width: 980px) {
  .desktop-config-panel {
    display: none;
  }
}
</style>
