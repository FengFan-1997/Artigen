<template>
  <div
    ref="root"
    class="agent-workspace-shell"
    :class="{
      'left-collapsed': leftCollapsed,
      'right-collapsed': rightCollapsed,
      'left-drawer-open': leftDrawerOpen,
      'right-drawer-open': rightDrawerOpen
    }"
    :data-theme="resolvedTheme"
    :style="workspaceStyle"
  >
    <!--
    THESIS: Three live work lanes—history, conversation, inspector—replace the split hero and form worlds.
    OWN-WORLD: Graphite-first surfaces, a complete light counterpart, an acid execution spine, 8–12px radii, and one SVG icon language.
    STORY: Ask once, then watch routing, sub Agents, the safe desktop, and files without leaving the task.
    FIRST VIEWPORT: History and settings at left, durable conversation and composer in the center, live environment and execution context at right.
    FORM: Code-led, user-pinned Codex-class workspace; no concept seed roll.
    FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
    -->
    <a class="skip-link" href="#artigen-workspace-main">{{ zh ? '跳到主要内容' : 'Skip to main content' }}</a>

    <nav class="workspace-rail" :inert="commandOpen || leftDrawerOpen || rightDrawerOpen ? true : undefined" :aria-label="zh ? '功能切换' : 'App navigation'">
      <router-link class="rail-brand" to="/artigen/create" aria-label="Artigen" title="Artigen">A</router-link>
      <button type="button" :title="zh ? '项目与会话' : 'Projects and chats'" :aria-label="leftCollapsed && !overlayLayout ? (zh ? '展开左栏' : 'Expand left panel') : (zh ? '项目与会话' : 'Projects and chats')" :aria-expanded="!leftCollapsed" aria-controls="workspace-history-panel" @click="openLeftDrawer"><WorkspaceIcon name="panel-left" :size="20" /></button>
      <router-link class="rail-chat" :class="{ 'rail-active': route.path.startsWith('/artigen/agent') }" to="/artigen/create" :aria-current="route.path.startsWith('/artigen/agent') ? 'location' : undefined" :title="zh ? '会话' : 'Chat'" :aria-label="zh ? '会话' : 'Chat'"><WorkspaceIcon name="chat" :size="20" /></router-link>
      <router-link to="/artigen/projects" :title="zh ? '项目' : 'Projects'" :aria-label="zh ? '项目' : 'Projects'"><WorkspaceIcon name="folder" :size="20" /></router-link>
      <router-link to="/artigen/tools" :title="zh ? '工具' : 'Tools'" :aria-label="zh ? '工具' : 'Tools'"><WorkspaceIcon name="tools" :size="20" /></router-link>
      <router-link to="/artigen/ai" :title="zh ? '高级生图' : 'Image studio'" :aria-label="zh ? '高级生图' : 'Image studio'"><WorkspaceIcon name="image" :size="20" /></router-link>
      <button type="button" title="GitHub" aria-label="GitHub" :aria-pressed="resourceMode === 'github' && (overlayLayout ? rightDrawerOpen : !rightCollapsed)" @click="openResources('github')"><WorkspaceIcon name="git" :size="20" /></button>
      <span class="rail-spacer"></span>
      <button type="button" :title="themeLabel" :aria-label="zh ? `外观：${themeLabel}` : `Appearance: ${themeLabel}`" @click="cycleTheme"><WorkspaceIcon :name="themeIcon" :size="20" /></button>
      <router-link to="/login/account" :title="zh ? '账户设置' : 'Account settings'" :aria-label="zh ? '账户设置' : 'Account settings'"><WorkspaceIcon name="settings" :size="20" /></router-link>
    </nav>

    <aside
      id="workspace-history-panel"
      ref="leftPanel"
      class="workspace-left"
      :aria-label="zh ? '任务历史' : 'Workspace history'"
      :aria-hidden="overlayLayout && !leftDrawerOpen ? 'true' : undefined"
      :inert="commandOpen || rightDrawerOpen || (overlayLayout && !leftDrawerOpen) ? true : undefined"
    >
      <header class="workspace-brand">
        <router-link to="/artigen/create" class="brand-lockup" aria-label="Artigen">
          <span class="brand-glyph" aria-hidden="true">A</span>
          <span class="brand-word">Artigen</span>
        </router-link>
        <button class="icon-control desktop-only" type="button" :aria-label="leftCollapsed ? (zh ? '展开左栏' : 'Expand left panel') : (zh ? '折叠左栏' : 'Collapse left panel')" :aria-expanded="!leftCollapsed" aria-controls="workspace-history-panel" @click="toggleLeft">
          <WorkspaceIcon name="panel-left" :size="18" />
        </button>
        <button class="icon-control mobile-only" type="button" :aria-label="zh ? '关闭历史' : 'Close history'" @click="closeLeftDrawer(true)">
          <WorkspaceIcon name="close" :size="18" />
        </button>
      </header>

      <button class="new-task" type="button" @click="$emit('new-task')">
        <WorkspaceIcon name="plus" />
        <span>{{ zh ? '新任务' : 'New task' }}</span>
        <kbd>{{ shortcutModifier }}N</kbd>
      </button>

      <label class="history-search">
        <WorkspaceIcon name="search" />
        <span class="sr-only">{{ zh ? '搜索任务' : 'Search tasks' }}</span>
        <input v-model="search" name="workspace-search" type="search" autocomplete="off" :placeholder="zh ? '搜索任务' : 'Search tasks'" @input="$emit('search', search)" />
      </label>

      <div class="history-slot" @click="onHistoryClick">
        <ProjectNavigation :zh="zh" :search="search" @navigate="closeLeftDrawer"><slot name="history" :search="search" /></ProjectNavigation>
      </div>

      <footer class="workspace-account">
        <router-link to="/artigen/usage" class="account-action" :aria-label="`${creditCaption}${creditLabel ? ': ' + creditLabel : ''}`">
          <span class="account-icon" aria-hidden="true">
            <WorkspaceIcon name="spark" :size="16" />
          </span>
          <span class="account-label">{{ creditCaption }}</span>
          <b v-if="creditLabel" class="account-value">{{ creditLabel }}</b>
        </router-link>
        <button class="mobile-only" type="button" :aria-label="zh ? `外观：${themeLabel}` : `Appearance: ${themeLabel}`" @click="cycleTheme"><WorkspaceIcon name="moon" :size="16"/><span>{{ zh ? '外观' : 'Appearance' }}</span><small>{{ themeLabel }}</small></button>
        <router-link class="mobile-only account-action" to="/login/account" :aria-label="zh ? '账户设置' : 'Account settings'"><WorkspaceIcon name="settings" :size="16"/><span>{{ zh ? '设置' : 'Settings' }}</span></router-link>
      </footer>
    </aside>

    <button v-if="leftDrawerOpen || rightDrawerOpen" class="drawer-scrim" type="button" tabindex="-1" :aria-label="zh ? '关闭面板' : 'Close panel'" @click="closeDrawers"></button>
    <div
      class="panel-resizer left-resizer desktop-only"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-controls="workspace-history-panel"
      aria-valuemin="216"
      aria-valuemax="340"
      :aria-valuenow="leftWidth"
      :aria-label="zh ? '调整左栏宽度' : 'Resize left panel'"
      @pointerdown="beginResize('left', $event)"
      @keydown="onResizerKeydown('left', $event)"
    ></div>

    <main
      id="artigen-workspace-main"
      class="workspace-main"
      tabindex="-1"
      :inert="commandOpen || leftDrawerOpen || rightDrawerOpen ? true : undefined"
    >
      <header class="workspace-topbar">
        <div class="mobile-panel-controls">
          <button ref="leftDrawerButton" class="icon-control" type="button" :aria-label="zh ? '打开历史' : 'Open history'" @click="openLeftDrawer">
            <WorkspaceIcon name="panel-left" :size="18" />
          </button>
        </div>
        <div class="topbar-heading-slot">
          <slot name="topbar">
            <div class="task-heading">
              <span class="task-heading-icon" aria-hidden="true"><WorkspaceIcon name="folder" :size="18" /></span>
              <span class="task-heading-copy">
                <strong>{{ title }}</strong>
                <small v-if="subtitle">{{ subtitle }}</small>
              </span>
            </div>
          </slot>
          <div v-if="statusTone !== 'ready' || taskCostLabel" class="task-meta">
            <span class="runtime-pill" :class="statusTone"><i aria-hidden="true"></i>{{ statusLabel }}</span>
            <span v-if="taskCostLabel" class="task-cost">{{ taskCostLabel }}</span>
          </div>
        </div>
        <span v-if="isDevEnvironment" class="workspace-environment" :aria-label="zh ? 'DEV 测试环境' : 'DEV test environment'">DEV</span>
        <div class="topbar-actions">
          <slot name="topbar-actions" />
          <button ref="rightDrawerButton" class="icon-control inspector-toggle" type="button" :aria-label="zh ? '打开检查器' : 'Open inspector'" :aria-expanded="overlayLayout ? rightDrawerOpen : !rightCollapsed" aria-controls="workspace-inspector-panel" @click="toggleRight">
            <WorkspaceIcon name="panel-right" :size="18" />
          </button>
        </div>
      </header>
      <div class="main-slot"><slot /></div>
    </main>

    <div
      class="panel-resizer right-resizer desktop-only"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-controls="workspace-inspector-panel"
      aria-valuemin="480"
      :aria-valuemax="Math.max(480, viewportWidth - 56 - (leftCollapsed ? 0 : leftWidth) - 480)"
      :aria-valuenow="visibleRightWidth"
      :aria-label="zh ? '调整右栏宽度' : 'Resize inspector'"
      @pointerdown="beginResize('right', $event)"
      @keydown="onResizerKeydown('right', $event)"
    ></div>
    <aside
      id="workspace-inspector-panel"
      ref="rightPanel"
      class="workspace-right"
      :aria-label="zh ? 'Agent 检查器' : 'Agent inspector'"
      :aria-hidden="overlayLayout && !rightDrawerOpen ? 'true' : undefined"
      :inert="commandOpen || leftDrawerOpen || (overlayLayout && !rightDrawerOpen) ? true : undefined"
    >
      <nav class="resource-tabs" :aria-label="zh ? '资源面板' : 'Resources'">
        <button v-for="item in resourceModes" :key="item.id" class="resource-mode" type="button" :aria-pressed="resourceMode === item.id" @click="resourceMode = item.id"><WorkspaceIcon :name="item.icon" :size="16" /><span>{{ item.label }}</span></button>
        <span class="resource-tabs-spacer" />
        <button v-if="resourceMode === 'files' || resourceMode === 'changes'" ref="directoryToggle" class="resource-icon-control tree-toggle" type="button" :aria-label="resourceWorkspace?.treeVisible ? (zh ? '隐藏目录树' : 'Hide file tree') : (zh ? '显示目录树' : 'Show file tree')" :aria-pressed="resourceWorkspace?.treeVisible" @click="resourceWorkspace?.toggleTree()"><WorkspaceIcon name="panel-right" :size="18" /></button>
        <button class="resource-icon-control" type="button" :aria-label="zh ? '关闭资源区' : 'Close resources'" @click="closeRight(true)"><WorkspaceIcon name="close" :size="18" /></button>
      </nav>
      <ResourceWorkspace ref="resourceWorkspace" v-show="resourceMode !== 'task'" :mode="resourceMode" :project-id="projectId || String(route.query.projectId || '')" :artifacts="artifacts" :zh="zh" @changes="resourceMode = 'changes'" @focus-directory="directoryToggle?.focus({ preventScroll: true })" />
      <div v-show="resourceMode === 'task'" class="task-inspector">
      <header class="inspector-head">
        <div>
          <span>{{ zh ? '任务上下文' : 'Task context' }}</span>
        </div>
        <button class="icon-control" type="button" :aria-label="zh ? '关闭检查器' : 'Close inspector'" @click="closeRight(true)">
          <WorkspaceIcon name="close" :size="18" />
        </button>
      </header>
      <div class="inspector-tabs" role="tablist" :aria-label="zh ? '检查器面板' : 'Inspector panels'">
        <button
          v-for="tab in tabs"
          :id="`workspace-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`workspace-panel-${tab.id}`"
          :tabindex="activeTab === tab.id ? 0 : -1"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
          @keydown="onTabKeydown(tab.id, $event)"
        >
          <WorkspaceIcon :name="tabIcons[tab.id]" :size="16" />
          <span>{{ tab.label }}</span>
          <i v-if="badges[tab.id]" :aria-label="`${badges[tab.id]} notifications`">{{ badges[tab.id] }}</i>
        </button>
      </div>
      <section
        v-for="tab in tabs"
        v-show="activeTab === tab.id"
        :id="`workspace-panel-${tab.id}`"
        :key="`${tab.id}-panel`"
        class="inspector-panel"
        role="tabpanel"
        :aria-labelledby="`workspace-tab-${tab.id}`"
      >
        <slot :name="tab.id">
          <div class="empty-panel"><span></span><b>{{ emptyInspectorLabel(tab.id) }}</b><small>{{ zh ? '运行后会在这里持续更新。' : 'This panel updates while the task runs.' }}</small></div>
        </slot>
      </section>
      </div>
    </aside>

    <div class="aria-updates sr-only" aria-live="polite">{{ liveAnnouncement }}</div>

    <div v-if="commandOpen" class="command-layer" @mousedown.self="closeCommandPalette">
      <section ref="commandPanel" class="command-palette" role="dialog" aria-modal="true" :aria-label="zh ? '命令面板' : 'Command palette'">
        <label>
          <WorkspaceIcon name="search" :size="18" />
          <span class="sr-only">{{ zh ? '搜索页面或动作' : 'Search pages or actions' }}</span>
          <input ref="commandInput" v-model="commandQuery" name="workspace-command" type="search" autocomplete="off" :aria-label="zh ? '搜索页面或动作' : 'Search pages or actions'" :placeholder="zh ? '搜索页面或动作…' : 'Search pages or actions…'" />
          <kbd aria-hidden="true">Esc</kbd>
        </label>
        <div>
          <button v-for="command in filteredCommands" :key="command.id" type="button" @click="runCommand(command)">
            <span><b>{{ command.label }}</b><small>{{ command.hint }}</small></span>
            <kbd>{{ command.shortcut }}</kbd>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import ProjectNavigation from './ProjectNavigation.vue';
import ResourceWorkspace from './ResourceWorkspace.vue';
import type { AgentArtifact } from '../../services/agentRuns';
import WorkspaceIcon from './WorkspaceIcon.vue';

type InspectorTab = 'environment' | 'plan' | 'subagents' | 'computer' | 'files';
type ThemeMode = 'dark' | 'light' | 'system';
type ResizeTarget = 'left' | 'right';

const tabIcons = {
  environment: 'terminal',
  plan: 'list',
  subagents: 'subagents',
  computer: 'monitor',
  files: 'file'
} as const;

const props = withDefaults(defineProps<{
  projectId?: string | null;
  artifacts?: AgentArtifact[];
  zh?: boolean;
  title?: string;
  subtitle?: string;
  statusLabel?: string;
  statusTone?: 'ready' | 'busy' | 'warning' | 'offline';
  creditLabel?: string;
  taskCostLabel?: string;
  creditCaption?: string;
  defaultInspectorCollapsed?: boolean;
  inspectorSubtitle?: string;
  defaultInspectorTab?: InspectorTab;
  badges?: Partial<Record<InspectorTab, number>>;
  liveAnnouncement?: string;
}>(), {
  artifacts: () => [],
  projectId: null,
  zh: true,
  title: 'Artigen Design Agent',
  subtitle: '',
  statusLabel: 'Ready',
  statusTone: 'ready',
  creditLabel: '',
  taskCostLabel: '',
  defaultInspectorCollapsed: false,
  inspectorSubtitle: '',
  defaultInspectorTab: 'environment',
  badges: () => ({}),
  liveAnnouncement: ''
});

const emit = defineEmits<{
  'new-task': [];
  search: [value: string];
  'open-credits': [];
  'open-settings': [];
}>();

const router = useRouter();
const route = useRoute();
const isDevEnvironment = ['dev', 'development'].includes(String(import.meta.env.VITE_APP_ENV || '').toLowerCase());
const resourceWorkspace = ref<InstanceType<typeof ResourceWorkspace> | null>(null);
const directoryToggle = ref<HTMLButtonElement | null>(null);
const viewportWidth = ref(window.innerWidth);
const resourceMode = ref<'files' | 'changes' | 'github' | 'task'>('files');
const resourceModes = computed(() => [ { id: 'files' as const, icon: 'file' as const, label: props.zh ? '文件' : 'Files' }, { id: 'changes' as const, icon: 'changes' as const, label: props.zh ? '变更' : 'Changes' }, { id: 'github' as const, icon: 'git' as const, label: 'GitHub' }, { id: 'task' as const, icon: 'list' as const, label: props.zh ? '任务' : 'Task' } ]);
const openResources = async (mode: typeof resourceMode.value) => {
  resourceMode.value = mode;
  if (isOverlayLayout()) {
    rememberDrawerFocus();
    leftDrawerOpen.value = false;
    rightDrawerOpen.value = true;
    await nextTick();
    rightPanel.value?.querySelector<HTMLElement>('button')?.focus();
  } else { rightPreferenceSet = true; rightCollapsed.value = false; persistPreferences(); }
};
const openFileEvent = () => { void openResources('files'); };

const root = ref<HTMLElement | null>(null);
const leftPanel = ref<HTMLElement | null>(null);
const rightPanel = ref<HTMLElement | null>(null);
const leftDrawerButton = ref<HTMLButtonElement | null>(null);
const rightDrawerButton = ref<HTMLButtonElement | null>(null);
const commandPanel = ref<HTMLElement | null>(null);
const commandInput = ref<HTMLInputElement | null>(null);
const search = ref('');
const leftCollapsed = ref(false);
const rightCollapsed = ref(props.defaultInspectorCollapsed);
let rightPreferenceSet = false;
const inspectorVisibility: Partial<Record<'compose' | 'task', boolean>> = {};
const inspectorScope = () => props.defaultInspectorCollapsed ? 'compose' : 'task';
const leftDrawerOpen = ref(false);
const rightDrawerOpen = ref(false);
const leftWidth = ref(280);
const rightWidth = ref(Math.max(480, window.innerWidth * .52));
const activeTab = ref<InspectorTab>(props.defaultInspectorTab);
const theme = ref<ThemeMode>('dark');
const systemDark = ref(true);
const commandOpen = ref(false);
const commandQuery = ref('');
const overlayLayout = ref(false);
const shortcutModifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const creditCaption = computed(() => props.creditCaption || (props.zh ? '点数与用量' : 'Credits & usage'));
let resizeTarget: ResizeTarget | null = null;
let media: MediaQueryList | null = null;
let layoutMedia: MediaQueryList | null = null;
let commandReturnFocus: HTMLElement | null = null;
let drawerReturnFocus: HTMLElement | null = null;
const rememberDrawerFocus = () => {
  if (!leftDrawerOpen.value && !rightDrawerOpen.value && document.activeElement instanceof HTMLElement)
    drawerReturnFocus = document.activeElement;
};
const restoreDrawerFocus = (fallback: HTMLElement | null) => {
  const target = drawerReturnFocus?.isConnected ? drawerReturnFocus : fallback;
  drawerReturnFocus = null;
  void nextTick(() => target?.focus({ preventScroll: true }));
};

const tabs = computed(() => [
  { id: 'environment' as const, label: props.zh ? '环境' : 'Environment' },
  { id: 'plan' as const, label: props.zh ? '计划' : 'Plan' },
  { id: 'subagents' as const, label: props.zh ? '子 Agent' : 'Subagents' },
  { id: 'computer' as const, label: props.zh ? '电脑' : 'Computer' },
  { id: 'files' as const, label: props.zh ? '文件' : 'Files' }
]);
const resolvedTheme = computed(() => theme.value === 'system'
  ? (systemDark.value ? 'dark' : 'light')
  : theme.value);
const themeIcon = computed(() => theme.value === 'system' ? 'monitor' : resolvedTheme.value === 'light' ? 'sun' : 'moon');
const visibleRightWidth = computed(() => Math.min(rightWidth.value, Math.max(480, viewportWidth.value - 56 - (leftCollapsed.value ? 0 : leftWidth.value) - 480)));
const workspaceStyle = computed(() => ({
  '--workspace-left-width': `${leftWidth.value}px`,
  '--workspace-right-width': `${visibleRightWidth.value}px`
}));
const themeLabel = computed(() => {
  const labels = props.zh
    ? { dark: '深色', light: '浅色', system: '跟随系统' }
    : { dark: 'Dark', light: 'Light', system: 'System' };
  return labels[theme.value];
});
const commands = computed(() => [
  { id: 'new', label: props.zh ? '新任务' : 'New task', hint: props.zh ? '开始一个新的设计任务' : 'Start a new design task', shortcut: `${shortcutModifier}N`, action: () => emit('new-task') },
  { id: 'create', label: props.zh ? '设计 Agent' : 'Design Agent', hint: '/artigen/create', shortcut: '', action: () => router.push('/artigen/create') },
  { id: 'agent', label: props.zh ? '电脑 Agent' : 'Computer Agent', hint: '/artigen/agent', shortcut: '', action: () => router.push('/artigen/agent') },
  { id: 'images', label: props.zh ? '高级生图' : 'Image studio', hint: '/artigen/ai', shortcut: '', action: () => router.push('/artigen/ai') },
  { id: 'theme', label: props.zh ? '切换主题' : 'Cycle theme', hint: themeLabel.value, shortcut: '', action: cycleTheme }
]);
const filteredCommands = computed(() => {
  const query = commandQuery.value.trim().toLowerCase();
  return query
    ? commands.value.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(query))
    : commands.value;
});

const emptyInspectorLabel = (id: InspectorTab) => ({
  environment: props.zh ? '等待环境信息' : 'Waiting for environment',
  plan: props.zh ? '等待执行计划' : 'Waiting for a plan',
  subagents: props.zh ? '还没有子 Agent' : 'No subagents yet',
  computer: props.zh ? '安全桌面未启动' : 'Secure desktop is idle',
  files: props.zh ? '还没有交付文件' : 'No files yet'
}[id]);

const persistPreferences = () => {
  if (rightPreferenceSet) inspectorVisibility[inspectorScope()] = rightCollapsed.value;
  try { localStorage.setItem('artigen-workspace-preferences', JSON.stringify({
    version: 4,
    theme: theme.value,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    leftCollapsed: leftCollapsed.value,
    resourceMode: resourceMode.value,
    inspectorVisibility
  })); } catch { /* Layout remains usable without browser storage. */ }
};
const toggleLeft = () => { leftCollapsed.value = !leftCollapsed.value; persistPreferences(); };
const isOverlayLayout = () => overlayLayout.value;
const openLeftDrawer = async () => {
  if (!isOverlayLayout()) return toggleLeft();
  rememberDrawerFocus();
  leftDrawerOpen.value = true;
  rightDrawerOpen.value = false;
  await nextTick();
  leftPanel.value?.querySelector<HTMLElement>('button,a,input')?.focus();
};
const closeLeftDrawer = (restore = false) => {
  leftDrawerOpen.value = false;
  if (restore) {
    const target = leftDrawerButton.value || root.value?.querySelector<HTMLButtonElement>('.mobile-panel-controls button');
    restoreDrawerFocus(target || null);
  }
};
const closeRight = (restore = false) => {
  if (isOverlayLayout()) rightDrawerOpen.value = false;
  else { rightPreferenceSet = true; rightCollapsed.value = true; persistPreferences(); }
  if (restore) restoreDrawerFocus(rightDrawerButton.value);
};
const toggleRight = async () => {
  if (isOverlayLayout()) {
    rememberDrawerFocus();
    rightDrawerOpen.value = !rightDrawerOpen.value;
    leftDrawerOpen.value = false;
    if (rightDrawerOpen.value) {
      await nextTick();
      rightPanel.value?.querySelector<HTMLElement>('button')?.focus();
    }
    return;
  }
  rightCollapsed.value = !rightCollapsed.value;
  rightPreferenceSet = true;
  persistPreferences();
};
// Legacy navigation remains available while the projection endpoint is loading/unavailable.
const onHistoryClick = (event: MouseEvent) => {
  if ((event.target as Element).closest('.history-item')) closeLeftDrawer();
};
const closeDrawers = () => { if (leftDrawerOpen.value) closeLeftDrawer(true); else closeRight(true); };
const cycleTheme = () => {
  const order: ThemeMode[] = ['dark', 'light', 'system'];
  theme.value = order[(order.indexOf(theme.value) + 1) % order.length];
  persistPreferences();
};
const beginResize = (target: ResizeTarget, event: PointerEvent) => {
  if (event.button !== 0 || isOverlayLayout()) return;
  resizeTarget = target;
  document.body.classList.add('workspace-resizing');
  window.addEventListener('pointermove', onResize);
  window.addEventListener('pointerup', endResize, { once: true });
  window.addEventListener('pointercancel', endResize, { once: true });
  window.addEventListener('blur', endResize, { once: true });
};
const onResize = (event: PointerEvent) => {
  if (resizeTarget === 'left') leftWidth.value = Math.min(340, Math.max(216, event.clientX - 56));
  if (resizeTarget === 'right') rightWidth.value = Math.min(Math.max(480, innerWidth - 56 - (leftCollapsed.value ? 0 : leftWidth.value) - 480), Math.max(480, window.innerWidth - event.clientX));
};
const onResizerKeydown = (target: ResizeTarget, event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const minimum = target === 'left' ? 216 : 480;
  const maximum = target === 'left' ? 340 : Math.max(480, innerWidth - 56 - (leftCollapsed.value ? 0 : leftWidth.value) - 480);
  const width = target === 'left' ? leftWidth : rightWidth;
  if (event.key === 'Home') width.value = minimum;
  else if (event.key === 'End') width.value = maximum;
  else {
    const physicalDirection = event.key === 'ArrowRight' ? 1 : -1;
    const panelDirection = target === 'left' ? physicalDirection : -physicalDirection;
    const step = event.shiftKey ? 24 : 8;
    width.value = Math.min(maximum, Math.max(minimum, width.value + panelDirection * step));
  }
  persistPreferences();
};
const endResize = () => {
  resizeTarget = null;
  document.body.classList.remove('workspace-resizing');
  window.removeEventListener('pointermove', onResize);
  window.removeEventListener('pointerup', endResize);
  window.removeEventListener('pointercancel', endResize);
  window.removeEventListener('blur', endResize);
  persistPreferences();
};
const onTabKeydown = (id: InspectorTab, event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const ids = tabs.value.map((tab) => tab.id);
  const index = ids.indexOf(id);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : event.key === 'ArrowRight' ? (index + 1) % ids.length : (index - 1 + ids.length) % ids.length;
  activeTab.value = ids[next];
  void nextTick(() => document.getElementById(`workspace-tab-${ids[next]}`)?.focus());
};
const openCommandPalette = async () => {
  commandReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  commandOpen.value = true;
  commandQuery.value = '';
  await nextTick();
  commandInput.value?.focus();
};
const closeCommandPalette = () => {
  commandOpen.value = false;
  const target = commandReturnFocus;
  commandReturnFocus = null;
  if (target?.isConnected) void nextTick(() => target.focus({ preventScroll: true }));
};
const runCommand = (command: { action: () => void }) => { closeCommandPalette(); command.action(); };
const trapFocus = (panel: HTMLElement | null, event: KeyboardEvent) => {
  if (event.key !== 'Tab' || !panel) return;
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button,a[href],input:not([type="hidden"]),select,textarea,summary,[tabindex]'))
    .filter((item) => item.tabIndex >= 0 && !item.matches(':disabled') && item.offsetParent !== null && !item.closest('[inert]'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
};
const onShellKeydown = (event: KeyboardEvent) => {
  // Nested widgets (for example editor search) own the first Escape.
  if (event.defaultPrevented) return;
  const commandKey = event.metaKey || event.ctrlKey;
  if (commandKey && event.key.toLowerCase() === 'k') { event.preventDefault(); void openCommandPalette(); return; }
  if (commandKey && event.key.toLowerCase() === 'n') { event.preventDefault(); emit('new-task'); return; }
  if (event.key === 'Escape') {
    if (commandOpen.value) return closeCommandPalette();
    if (leftDrawerOpen.value) return closeLeftDrawer(true);
    if (rightDrawerOpen.value) return closeRight(true);
  }
  if (commandOpen.value) trapFocus(commandPanel.value, event);
  else if (leftDrawerOpen.value) trapFocus(leftPanel.value, event);
  else if (rightDrawerOpen.value) trapFocus(rightPanel.value, event);
};

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem('artigen-workspace-preferences') || '{}');
    if (['files','changes','github','task'].includes(stored.resourceMode)) resourceMode.value = stored.resourceMode;
    if (['dark', 'light', 'system'].includes(stored.theme)) theme.value = stored.theme;
    if ([2,3,4].includes(stored.version) && Number(stored.leftWidth)) leftWidth.value = Math.min(340, Math.max(216, Number(stored.leftWidth)));
    if ([3,4].includes(stored.version) && Number(stored.rightWidth)) rightWidth.value = Math.max(480, Number(stored.rightWidth));
    leftCollapsed.value = stored.leftCollapsed === true;
    // Legacy visibility belonged to active tasks. It must not open a new, empty composer.
    for (const scope of ['compose', 'task'] as const) {
      const preference = stored.version === 4 ? stored.inspectorVisibility?.[scope] : scope === 'task' ? stored.rightCollapsed : undefined;
      if (typeof preference === 'boolean') inspectorVisibility[scope] = preference;
    }
    const preference = inspectorVisibility[inspectorScope()];
    if (typeof preference === 'boolean') {
      rightPreferenceSet = true;
      rightCollapsed.value = preference;
    }
  } catch {}
  media = window.matchMedia('(prefers-color-scheme: dark)');
  const syncTheme = () => { systemDark.value = media?.matches ?? true; };
  syncTheme();
  media.addEventListener('change', syncTheme);
  layoutMedia = window.matchMedia('(max-width: 1439px)');
  const syncLayout = () => {
    viewportWidth.value = window.innerWidth;
    overlayLayout.value = layoutMedia?.matches ?? false;
    if (!overlayLayout.value) {
      leftDrawerOpen.value = false;
      rightDrawerOpen.value = false;
    }
  };
  syncLayout();
  layoutMedia.addEventListener('change', syncLayout);
  window.addEventListener('resize', syncLayout);
  (root.value as HTMLElement & { __mediaCleanup?: () => void }).__mediaCleanup = () => {
    media?.removeEventListener('change', syncTheme);
    layoutMedia?.removeEventListener('change', syncLayout);
    window.removeEventListener('resize', syncLayout);
  };
  window.addEventListener('keydown', onShellKeydown);
  window.addEventListener('workspace:open-file', openFileEvent);
});

watch(resourceMode, persistPreferences);
watch(() => props.defaultInspectorTab, (value) => { activeTab.value = value; resourceMode.value = 'task'; });
watch(() => props.defaultInspectorCollapsed, (value) => {
  const preference = inspectorVisibility[inspectorScope()];
  rightPreferenceSet = typeof preference === 'boolean';
  rightCollapsed.value = preference ?? value;
});
onBeforeUnmount(() => {
  endResize();
  window.removeEventListener('keydown', onShellKeydown);
  window.removeEventListener('workspace:open-file', openFileEvent);
  (root.value as (HTMLElement & { __mediaCleanup?: () => void }) | null)?.__mediaCleanup?.();
});
</script>

<style scoped>
.agent-workspace-shell {
  --bg: #111311;
  --sidebar: #1b1e1b;
  --surface: #232622;
  --surface-raised: #2a2e29;
  --surface-hover: #313530;
  --border: #7b8375;
  --text: #f3f4ef;
  --muted: #a1a79b;
  --muted-2: #a1a79b;
  --acid: #c8ff3d;
  --acid-text: #c8ff3d;
  --acid-ink: #11140c;
  --focus: #c8ff3d;
  --danger: #ff6b62;
  --warning: #f1bd4f;
  --success: #69d59a;
  --workspace-header-height: 56px;
  --font-meta: 12px;
  --font-control: 13px;
  --font-body: 15px;
  --conversation-max: 760px;
  --conversation-gutter: 28px;
  --left-live: var(--workspace-left-width);
  --right-live: var(--workspace-right-width);
  display: grid;
  grid-template-columns: 56px var(--left-live) minmax(0, 1fr) var(--right-live);
  width: 100%;
  min-width: 0;
  height: 100dvh;
  overflow: hidden;
  color: var(--text);
  background: var(--bg);
  color-scheme: dark;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
  text-align: left;
}
.agent-workspace-shell[data-theme="light"] {
  --bg: #f4f5f1;
  --sidebar: #e9ece6;
  --surface: #fff;
  --surface-raised: #f0f2ed;
  --surface-hover: #e3e7df;
  --border: #78816f;
  --text: #171a16;
  --muted: #5b6557;
  --muted-2: #566052;
  --acid-ink: #171a11;
  --acid-text: #426400;
  --focus: #426400;
  --danger: #a82d25;
  --warning: #775100;
  --success: #247344;
  color: #171a16;
  color-scheme: light;
}
.agent-workspace-shell[data-theme="light"] .brand-lockup { color: #171a16; }
.agent-workspace-shell.left-collapsed { --left-live: 0px; }
.left-collapsed .workspace-left { visibility: hidden; }
.agent-workspace-shell.right-collapsed { --right-live: 0px; }
*,*::before,*::after { box-sizing: border-box; }
.agent-workspace-shell :deep(*),.agent-workspace-shell :deep(*::before),.agent-workspace-shell :deep(*::after) { box-sizing: border-box; }
button,input { font: inherit; }
button { color: inherit; }
.agent-workspace-shell :deep(:where(button,a,summary,input,textarea,select):focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
.agent-workspace-shell :deep(:where(button,a,summary):focus:not(:focus-visible)) { outline: none; }
.agent-workspace-shell :deep(.composer-box textarea:focus-visible) { outline: none; }
.agent-workspace-shell :where(button,a,summary,label) { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
input,textarea { caret-color: var(--acid); }
.agent-workspace-shell ::selection { color: var(--acid-ink); background: color-mix(in srgb,var(--acid) 78%,transparent); }
svg { display: block; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
.skip-link { position: fixed; top: 8px; left: 50%; z-index: 500; padding: 9px 14px; border-radius: 8px; color: var(--acid-ink); background: var(--acid); transform: translate(-50%,-150%); transition: transform 160ms ease; }
.skip-link:focus { transform: translate(-50%,0); }
.workspace-left,.workspace-right,.workspace-main { min-width: 0; min-height: 0; }
.workspace-left,.workspace-right { overscroll-behavior: contain; }
.workspace-left { border-right: 1px solid var(--border); z-index: 40; display: flex; flex-direction: column; overflow: hidden; background: var(--sidebar); }
.workspace-brand { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; height: var(--workspace-header-height); min-height: var(--workspace-header-height); padding: 6px 12px 6px 16px; }
.brand-lockup { display: flex; align-items: center; gap: 11px; min-width: 0; min-height: 44px; padding: 6px 0; color: inherit; font-size: 16px; font-weight: 700; text-decoration: none; letter-spacing: -.015em; }
.brand-glyph { display: grid; flex: 0 0 auto; width: 32px; height: 32px; place-items: center; border: 0; border-radius: 10px; color: var(--text); font-size: 13px; font-weight: 760; background: var(--surface-raised); }
@media (min-width:1440px) { .brand-glyph { display:none; } }
.brand-word { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-control { display: inline-grid; flex: 0 0 auto; width: 36px; height: 36px; padding: 0; place-items: center; border: 0; border-radius: 9px; color: var(--muted); background: transparent; cursor: pointer; transition: color 150ms ease,background-color 150ms ease,transform 120ms cubic-bezier(.23,1,.32,1); }
.icon-control:hover { color: var(--text); background: var(--surface-hover); }
.icon-control:active { transform: scale(.96); }
.icon-control:focus-visible,.new-task:focus-visible,.history-search:focus-within,.workspace-nav a:focus-visible,.workspace-account :is(button,.account-action):focus-visible,.inspector-tabs button:focus-visible,.command-palette button:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
.icon-control svg { width: 18px; height: 18px; }
.new-task { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; min-height: 42px; margin: 2px 12px 8px; padding: 0 11px; border: 0; border-radius: 10px; color: var(--text); background: var(--surface-raised); cursor: pointer; transition: background-color 150ms ease,transform 120ms cubic-bezier(.23,1,.32,1); }
.new-task:hover { background: var(--surface-hover); }
.new-task:active { transform: scale(.985); }
.new-task svg { width: 16px; }
.new-task span { flex: 1; text-align: left; font-size: 13px; font-weight: 650; }
kbd { padding: 1px 5px; border: 0; border-radius: 5px; color: var(--muted-2); font-family: inherit; font-size: var(--font-meta); font-weight: 560; background: color-mix(in srgb,var(--surface) 72%,transparent); box-shadow: none; }
.history-search { display: flex; flex: 0 0 auto; align-items: center; gap: 9px; min-height: 40px; margin: 0 12px 10px; padding: 0 10px; border: 1px solid var(--border); border-radius: 10px; color: var(--muted); background: color-mix(in srgb,var(--surface) 76%,transparent); }
.history-search svg { width: 16px; height: 16px; }
.history-search input { width: 100%; min-width: 0; border: 0; outline: 0; color: var(--text); font-size: 12px; background: transparent; }
.history-search input::placeholder { color: var(--muted-2); }
.history-slot { flex: 1; min-height: 0; overflow: auto; padding: 4px 10px 12px; scrollbar-color: var(--border) transparent; }
.workspace-nav { display: grid; flex: 0 0 auto; gap: 3px; padding: 14px 10px 9px; }
.workspace-nav a { display: flex; align-items: center; gap: 11px; min-height: 38px; padding: 0 10px; border-radius: 9px; color: var(--muted); font-size: 13px; text-decoration: none; }
.workspace-nav a:hover,.workspace-nav a.router-link-active { color: var(--text); background: var(--surface-hover); }
.workspace-nav svg { flex: 0 0 auto; width: 16px; }
.workspace-account { display: grid; flex: 0 0 auto; gap: 3px; padding: 8px 10px 12px; }
.workspace-account :is(button,.account-action) { display: grid; grid-template-columns: 20px minmax(0,1fr) auto; align-items: center; gap: 11px; min-height: 42px; padding: 0 10px; border: 0; border-radius: 9px; color: inherit; text-align: left; text-decoration: none; background: transparent; cursor: pointer; }
.workspace-account :is(button,.account-action):hover { background: var(--surface-hover); }
.account-label { min-width: 0; overflow: hidden; color: var(--text); font-size: var(--font-control); font-weight: 590; text-overflow: ellipsis; white-space: nowrap; }
.account-value { max-width: 112px; overflow: hidden; color: var(--muted-2); font-size: var(--font-meta); font-weight: 560; text-align: right; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.account-icon { display: grid; width: 20px; height: 20px; place-items: center; color: var(--muted); }
.left-collapsed .brand-word,.left-collapsed .new-task span,.left-collapsed .new-task kbd,.left-collapsed .history-search input,.left-collapsed .history-search kbd,.left-collapsed .history-slot,.left-collapsed .workspace-nav span,.left-collapsed .workspace-account .account-label,.left-collapsed .workspace-account .account-value { display: none; }
.left-collapsed .workspace-brand { justify-content: space-between; gap: 2px; padding-inline: 2px; }
.left-collapsed .workspace-brand .brand-glyph { width: 28px; height: 28px; }
.left-collapsed .workspace-brand .icon-control { width: 30px; height: 30px; }
.left-collapsed .new-task,.left-collapsed .history-search,.left-collapsed .workspace-nav a,.left-collapsed .workspace-account :is(button,.account-action) { justify-content: center; padding-inline: 0; }
.left-collapsed .workspace-account :is(button,.account-action) { grid-template-columns: 20px; }
.panel-resizer { position: fixed; top: 0; bottom: 0; z-index: 45; width: 8px; cursor: col-resize; touch-action:none; }
.panel-resizer::after { position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; content: ""; transition: background 150ms ease; }
.panel-resizer:hover::after,.panel-resizer:active::after { background: var(--focus); }
.panel-resizer:focus-visible { outline: 2px solid var(--focus); outline-offset: -1px; }
.panel-resizer:focus-visible::after { width: 2px; background: var(--focus); }
.left-resizer { left: calc(56px + var(--left-live) - 4px); }
.right-resizer { right: calc(var(--right-live) - 4px); }
.right-resizer::after { left: 4px; }
.left-collapsed .left-resizer,.right-collapsed .right-resizer { display: none; }
.workspace-main { position: relative; display: flex; flex-direction: column; background: var(--bg); }
.workspace-topbar { border-bottom: 1px solid var(--border); display: flex; flex: 0 0 auto; align-items: center; gap: 8px; min-height: var(--workspace-header-height); padding: 6px 12px 6px 20px; overflow: hidden; background: var(--bg); }
.topbar-heading-slot { flex: 1 1 auto; min-width: 0; overflow: hidden; }
.task-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; margin-top: 0; }
.task-cost { color: var(--muted); font-size: var(--font-meta); line-height: 1.5; font-variant-numeric: tabular-nums; }
.task-heading { display: flex; min-width: 0; align-items: center; gap: 10px; }
.task-heading-icon { display: grid; flex: 0 0 auto; width: 20px; height: 20px; place-items: center; color: var(--muted); }
.task-heading-copy { display: grid; min-width: 0; gap: 2px; }
.task-heading strong { overflow: hidden; font-size: 14px; line-height: 20px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.task-heading small { overflow: hidden; color: var(--muted); font-size: var(--font-meta); text-overflow: ellipsis; white-space: nowrap; }
.topbar-actions,.mobile-panel-controls { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }
.runtime-pill { display: inline-flex; align-items: center; gap: 7px; min-height: 18px; padding: 0; color: var(--muted); font-size: var(--font-meta); font-weight: 620; white-space: nowrap; }
.runtime-pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.runtime-pill.ready i { background: var(--success); }.runtime-pill.busy i { background: var(--acid); }.runtime-pill.warning i { background: var(--warning); }.runtime-pill.offline i { background: var(--danger); }
.main-slot { flex: 1; min-height: 0; overflow: hidden; }
.workspace-right { border-left: 1px solid var(--border); z-index: 40; display: flex; flex-direction: column; height: 100%; margin: 0; overflow: hidden; border-radius: 0; background: var(--bg); }
.right-collapsed .workspace-right { visibility: hidden; }
.inspector-head { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; min-height: 58px; padding: 10px 12px 8px 18px; }
.inspector-head > div { display: grid; min-width: 0; gap: 2px; }
.inspector-head span { font-size: 14px; font-weight: 680; }
.inspector-head small { display: none; }
.inspector-tabs { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); flex: 0 0 auto; min-height: 56px; padding: 0 10px 8px; gap: 3px; }
.inspector-tabs button { position: relative; display: grid; min-width: 0; min-height: 48px; padding: 7px 2px 6px; overflow: hidden; place-items: center; gap: 4px; border: 0; border-radius: 9px; color: var(--muted); font-size: 12px; background: transparent; cursor: pointer; }
.inspector-tabs button:hover { color: var(--text); background: var(--surface); }
.inspector-tabs button.active { color: var(--text); background: var(--surface-raised); }
.inspector-tabs svg { width: 16px; height: 16px; }
.inspector-tabs i { position: absolute; top: 4px; right: 5px; display: grid; min-width: 16px; height: 16px; padding: 0 4px; place-items: center; border-radius: 999px; color: var(--acid-ink); font-size: 11px; font-style: normal; background: var(--acid); }
.inspector-panel { flex: 1; min-height: 0; overflow: auto; padding: 18px; scrollbar-color: var(--surface-hover) transparent; }
.empty-panel { display: grid; min-height: 180px; place-content: center; place-items: center; gap: 6px; color: var(--muted); text-align: center; }
.empty-panel span { width: 6px; height: 6px; border-radius: 50%; background: var(--muted-2); }
.empty-panel b { font-size: var(--font-control); font-weight: 620; }.empty-panel small { max-width: 190px; color: var(--muted-2); font-size: var(--font-meta); line-height: 1.5; }
.drawer-scrim { display: none; }
.command-layer { position: fixed; inset: 0; z-index: 400; display: grid; padding-top: 15vh; place-items: start center; background: rgb(0 0 0 / 42%); backdrop-filter: blur(3px); }
.command-palette { display:flex; flex-direction:column; max-height:calc(85dvh - 16px); width: min(560px,calc(100vw - 32px)); overflow: hidden; border: 0; border-radius: 12px; background: var(--surface); box-shadow: 0 24px 80px rgb(0 0 0 / 38%); }
.command-palette > label { flex:none; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 13px; }
.command-palette > label:focus-within { outline: 2px solid var(--focus); outline-offset: -2px; }
.command-palette > label svg { width: 18px; height: 18px; color: var(--muted); }.command-palette input { flex: 1; min-width: 0; border: 0; outline: 0; color: var(--text); font-size: 13px; background: transparent; }
.command-palette > div { min-height:0; max-height: 320px; overflow: auto; padding: 6px; }
.command-palette button { display: flex; width: 100%; align-items: center; justify-content: space-between; min-height: 48px; padding: 7px 9px; border: 0; border-radius: 8px; text-align: left; background: transparent; cursor: pointer; }
.command-palette button:hover { background: var(--surface-raised); }.command-palette button > span { display: grid; gap: 2px; }.command-palette b { font-size: var(--font-control); }.command-palette small { color: var(--muted); font-size: var(--font-meta); }
.mobile-only,.mobile-panel-controls,.workspace-account .mobile-only { display: none; }
.sr-only { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
@media (max-width: 1439px) {
  .agent-workspace-shell,.agent-workspace-shell.left-collapsed,.agent-workspace-shell.right-collapsed { --left-live: 0px; --right-live: 0px; grid-template-columns: 56px minmax(0,1fr); }
  .workspace-left,.workspace-right { position: fixed; top: 0; bottom: 0; height: auto; margin: 0; visibility: hidden; pointer-events: none; transition: transform 190ms cubic-bezier(.23,1,.32,1); }
  .workspace-left { left: 0; width: min(320px,86vw); transform: translateX(-103%); box-shadow: 24px 0 64px rgb(0 0 0 / 35%); }
  .workspace-right { right: 0; width: min(760px,calc(100vw - 56px)); border-radius: 18px 0 0 18px; transform: translateX(103%); box-shadow: -24px 0 64px rgb(0 0 0 / 35%); }
  .left-drawer-open .workspace-left,.right-drawer-open .workspace-right { visibility: visible; pointer-events: auto; transform: translateX(0); transition-delay: 0s; }
  .drawer-scrim { position: fixed; inset: 0; z-index: 30; display: block; border: 0; background: rgb(0 0 0 / 44%); }
  .desktop-only { display: none !important; }.mobile-only,.mobile-panel-controls { display: flex; }.workspace-account .mobile-only { display:grid; }
  .left-collapsed .brand-word,.left-collapsed .workspace-brand .icon-control,.left-collapsed .new-task span,.left-collapsed .new-task kbd,.left-collapsed .history-search input,.left-collapsed .history-search kbd,.left-collapsed .history-slot,.left-collapsed .workspace-nav span,.left-collapsed .workspace-account .account-label,.left-collapsed .workspace-account .account-value { display: initial; }
  .left-collapsed .workspace-brand { justify-content: space-between; padding: 10px 14px 8px 16px; }.left-collapsed .new-task,.left-collapsed .history-search,.left-collapsed .workspace-nav a { justify-content: flex-start; padding-inline: 10px; }.left-collapsed .workspace-account :is(button,.account-action) { grid-template-columns: 20px minmax(0,1fr) auto; justify-content: stretch; padding-inline: 10px; }
}
@media (max-width: 799px) {
  .agent-workspace-shell,.agent-workspace-shell.left-collapsed,.agent-workspace-shell.right-collapsed { --conversation-gutter: 16px; grid-template-columns: minmax(0,1fr); }
  .agent-workspace-shell .workspace-rail { display:none; }
  .task-heading { justify-content: flex-start; text-align: left; }
  .task-heading-icon { display: none; }
  .workspace-topbar { min-height: 68px; gap: 4px; padding-inline: max(8px,env(safe-area-inset-left)) max(8px,env(safe-area-inset-right)); }.task-meta { gap: 2px 8px; }.inspector-toggle,.icon-control { min-width: 44px; min-height: 44px; }.workspace-brand { min-height: 56px; padding-top: max(8px,env(safe-area-inset-top)); }.new-task,.history-search,.workspace-nav a,.workspace-account :is(button,.account-action) { min-height: 44px; }.workspace-account { padding-bottom: max(8px,env(safe-area-inset-bottom)); }.history-search input,.command-palette input { font-size: 16px; }
  .workspace-right { width: 100vw; border-radius: 0; }.inspector-tabs { min-height: 58px; }.inspector-tabs button { min-height: 56px; font-size: 12px; }
}
@media (pointer: coarse) {
  /* This touch contract must win over compact controls in nested route components. */
  .agent-workspace-shell :deep(button), .agent-workspace-shell :deep(select) { min-height:44px !important; min-width:44px !important; }
  .workspace-account .account-action { min-height:44px; }
  .agent-workspace-shell :deep(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])) { min-height:44px; font-size:16px; }
  .agent-workspace-shell :deep(label:has(input[type="checkbox"])) { min-height:44px; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; transition-duration: 0s !important; animation-duration: 0s !important; animation-iteration-count: 1 !important; }
}

/* One icon grid and one header baseline across all three workspace regions. */
.workspace-rail { border-right:1px solid var(--border); min-height:0; overflow-y:auto; display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 5px; background:var(--sidebar); scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
.workspace-rail > a,.workspace-rail > button { display:grid; flex:none; place-items:center; width:44px; height:44px; padding:0; border:0; border-radius:8px; color:var(--muted); background:transparent; text-decoration:none; cursor:pointer; transition:background-color 150ms ease,color 150ms ease; }
.workspace-rail > a:hover,.workspace-rail > button:hover { background:var(--surface-hover); color:var(--text); }
.workspace-rail > a:not(.rail-brand).router-link-active,.workspace-rail > .rail-active,.workspace-rail > button[aria-pressed="true"] { color:var(--text); background:var(--surface-hover); }
.workspace-rail > :is(a,button):active { background:var(--surface-raised); }
.workspace-rail .rail-brand { margin-bottom:8px; color:var(--text); font-size:17px; font-weight:750; }
.rail-spacer { flex:1; min-height:12px; }
.workspace-environment { flex:none; padding:2px 5px; border-radius:4px; color:var(--muted); background:var(--surface-raised); font-size:10px; line-height:16px; font-weight:650; letter-spacing:.04em; }
.resource-tabs { display:flex; flex:none; align-items:center; height:var(--workspace-header-height); min-height:var(--workspace-header-height); gap:2px; padding:0 8px; border-bottom:1px solid var(--border); }
.resource-tabs > button { display:inline-flex; flex:none; align-items:center; justify-content:center; gap:6px; height:36px; padding:0 10px; border:0; border-radius:7px; background:transparent; color:var(--muted); font:inherit; font-size:13px; cursor:pointer; transition:background-color 150ms ease,color 150ms ease; }
.resource-tabs > button:hover { color:var(--text); background:var(--surface-hover); }
.resource-tabs > button[aria-pressed="true"] { color:var(--text); background:var(--surface-raised); }
.resource-tabs > button:active { background:var(--surface-hover); }
.resource-tabs-spacer { flex:1; min-width:0; }
.resource-tabs > .resource-icon-control { width:32px; padding:0; }
.task-inspector { display:flex; flex:1; flex-direction:column; min-height:0; }.workspace-nav { display:none; }
@media(max-width:799px) { .resource-tabs { padding-inline:4px; gap:0; }.resource-tabs > button { min-width:44px; min-height:44px; padding-inline:8px; }.resource-tabs > .resource-icon-control { width:44px; padding:0; }.resource-mode svg { display:none; } }
</style>

<style>
body.workspace-resizing { cursor: col-resize !important; user-select: none !important; }
</style>
