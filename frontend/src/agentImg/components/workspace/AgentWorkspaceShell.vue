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
        <button class="icon-control desktop-only" type="button" :aria-label="zh ? '折叠左栏' : 'Collapse left panel'" @click="toggleLeft">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9 4v16"/></svg>
        </button>
        <button class="icon-control mobile-only" type="button" :aria-label="zh ? '关闭历史' : 'Close history'" @click="closeLeftDrawer(true)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </header>

      <button class="new-task" type="button" @click="$emit('new-task')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        <span>{{ zh ? '新任务' : 'New task' }}</span>
        <kbd>⌘N</kbd>
      </button>

      <label class="history-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
        <span class="sr-only">{{ zh ? '搜索任务' : 'Search tasks' }}</span>
        <input v-model="search" type="search" :placeholder="zh ? '搜索任务' : 'Search tasks'" @input="$emit('search', search)" />
        <kbd>⌘K</kbd>
      </label>

      <div class="history-slot">
        <slot name="history" :search="search" />
      </div>

      <nav class="workspace-nav" :aria-label="zh ? '工作台导航' : 'Workspace navigation'">
        <router-link to="/artigen/projects">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v14h-17z"/></svg>
          <span>{{ zh ? '项目' : 'Projects' }}</span>
        </router-link>
        <router-link to="/artigen/tools">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5a4 4 0 0 0 4.7 5.9l-8.8 8.8-3.6-3.6 8.8-8.8a4 4 0 0 0-1.1-2.3Z"/></svg>
          <span>{{ zh ? '工具' : 'Tools' }}</span>
        </router-link>
        <router-link to="/artigen/ai">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m7 16 3.5-4 2.5 2.5 2.2-2.5 2.8 4M8.5 8.5h.01"/></svg>
          <span>{{ zh ? '高级生图' : 'Image studio' }}</span>
        </router-link>
      </nav>

      <footer class="workspace-account">
        <button type="button" @click="$emit('open-credits')">
          <span class="account-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 2.8 14.2 9l6.2 2.2-6.2 2.2L12 19.6l-2.2-6.2-6.2-2.2L9.8 9z"/></svg>
          </span>
          <span><b>{{ creditLabel }}</b><small>{{ zh ? '点数与用量' : 'Credits & usage' }}</small></span>
        </button>
        <button type="button" @click="cycleTheme">
          <span class="account-icon" aria-hidden="true">
            <svg v-if="theme === 'dark'" viewBox="0 0 24 24"><path d="M19.5 15.2A8 8 0 0 1 8.8 4.5 8 8 0 1 0 19.5 15.2Z"/></svg>
            <svg v-else-if="theme === 'light'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>
            <svg v-else viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></svg>
          </span>
          <span><b>{{ themeLabel }}</b><small>{{ zh ? '外观' : 'Appearance' }}</small></span>
        </button>
        <button type="button" @click="$emit('open-settings')">
          <span class="account-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7-.7-2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z"/></svg>
          </span>
          <span><b>{{ zh ? '设置' : 'Settings' }}</b><small>{{ accountLabel }}</small></span>
        </button>
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
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M9 4v16"/></svg>
          </button>
        </div>
        <div class="topbar-heading-slot">
          <slot name="topbar">
            <div class="task-heading">
              <strong>{{ title }}</strong>
              <span>{{ subtitle }}</span>
            </div>
          </slot>
        </div>
        <div class="topbar-actions">
          <span class="runtime-pill" :class="statusTone"><i></i>{{ statusLabel }}</span>
          <slot name="topbar-actions" />
          <button ref="rightDrawerButton" class="icon-control inspector-toggle" type="button" :aria-label="zh ? '打开检查器' : 'Open inspector'" @click="toggleRight">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M15 4v16"/></svg>
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
      aria-valuemin="320"
      aria-valuemax="480"
      :aria-valuenow="rightWidth"
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
      <header class="inspector-head">
        <div>
          <span>{{ zh ? '实时上下文' : 'Live context' }}</span>
          <small>{{ inspectorSubtitle }}</small>
        </div>
        <button class="icon-control" type="button" :aria-label="zh ? '关闭检查器' : 'Close inspector'" @click="closeRight(true)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
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
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <template v-if="tab.id === 'environment'"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="m7 10 2 2-2 2M12 15h5"/></template>
            <template v-else-if="tab.id === 'plan'"><path d="M5 6h14M5 12h14M5 18h9"/><circle cx="3" cy="6" r=".5"/><circle cx="3" cy="12" r=".5"/><circle cx="3" cy="18" r=".5"/></template>
            <template v-else-if="tab.id === 'subagents'"><circle cx="12" cy="7" r="3"/><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M12 10v3M7.8 14.8 10 12.5M16.2 14.8 14 12.5"/></template>
            <template v-else-if="tab.id === 'computer'"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></template>
            <template v-else><path d="M5 3.5h9l5 5v12H5z"/><path d="M14 3.5v5h5M8 13h8M8 17h6"/></template>
          </svg>
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
    </aside>

    <div class="aria-updates sr-only" aria-live="polite">{{ liveAnnouncement }}</div>

    <div v-if="commandOpen" class="command-layer" @mousedown.self="closeCommandPalette">
      <section ref="commandPanel" class="command-palette" role="dialog" aria-modal="true" :aria-label="zh ? '命令面板' : 'Command palette'">
        <label>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input ref="commandInput" v-model="commandQuery" :placeholder="zh ? '搜索页面或动作…' : 'Search pages or actions…'" />
          <kbd>Esc</kbd>
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
import { useRouter } from 'vue-router';

type InspectorTab = 'environment' | 'plan' | 'subagents' | 'computer' | 'files';
type ThemeMode = 'dark' | 'light' | 'system';
type ResizeTarget = 'left' | 'right';

const props = withDefaults(defineProps<{
  zh?: boolean;
  title?: string;
  subtitle?: string;
  statusLabel?: string;
  statusTone?: 'ready' | 'busy' | 'warning' | 'offline';
  creditLabel?: string;
  accountLabel?: string;
  inspectorSubtitle?: string;
  defaultInspectorTab?: InspectorTab;
  badges?: Partial<Record<InspectorTab, number>>;
  liveAnnouncement?: string;
}>(), {
  zh: true,
  title: 'Artigen Design Agent',
  subtitle: '',
  statusLabel: 'Ready',
  statusTone: 'ready',
  creditLabel: '—',
  accountLabel: '',
  inspectorSubtitle: 'Qwen3 · Kolors',
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
const root = ref<HTMLElement | null>(null);
const leftPanel = ref<HTMLElement | null>(null);
const rightPanel = ref<HTMLElement | null>(null);
const leftDrawerButton = ref<HTMLButtonElement | null>(null);
const rightDrawerButton = ref<HTMLButtonElement | null>(null);
const commandPanel = ref<HTMLElement | null>(null);
const commandInput = ref<HTMLInputElement | null>(null);
const search = ref('');
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
const leftDrawerOpen = ref(false);
const rightDrawerOpen = ref(false);
const leftWidth = ref(248);
const rightWidth = ref(360);
const activeTab = ref<InspectorTab>(props.defaultInspectorTab);
const theme = ref<ThemeMode>('dark');
const systemDark = ref(true);
const commandOpen = ref(false);
const commandQuery = ref('');
const overlayLayout = ref(false);
let resizeTarget: ResizeTarget | null = null;
let media: MediaQueryList | null = null;
let layoutMedia: MediaQueryList | null = null;
let commandReturnFocus: HTMLElement | null = null;

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
const workspaceStyle = computed(() => ({
  '--workspace-left-width': `${leftWidth.value}px`,
  '--workspace-right-width': `${rightWidth.value}px`
}));
const themeLabel = computed(() => {
  const labels = props.zh
    ? { dark: '深色', light: '浅色', system: '跟随系统' }
    : { dark: 'Dark', light: 'Light', system: 'System' };
  return labels[theme.value];
});
const commands = computed(() => [
  { id: 'new', label: props.zh ? '新任务' : 'New task', hint: props.zh ? '开始一个新的设计任务' : 'Start a new design task', shortcut: '⌘N', action: () => emit('new-task') },
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
  localStorage.setItem('artigen-workspace-preferences', JSON.stringify({
    theme: theme.value,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    leftCollapsed: leftCollapsed.value,
    rightCollapsed: rightCollapsed.value
  }));
};
const toggleLeft = () => { leftCollapsed.value = !leftCollapsed.value; persistPreferences(); };
const isOverlayLayout = () => overlayLayout.value;
const openLeftDrawer = async () => {
  if (!isOverlayLayout()) return toggleLeft();
  leftDrawerOpen.value = true;
  rightDrawerOpen.value = false;
  await nextTick();
  leftPanel.value?.querySelector<HTMLElement>('button,a,input')?.focus();
};
const closeLeftDrawer = (restore = false) => {
  leftDrawerOpen.value = false;
  if (restore) {
    const target = leftDrawerButton.value || root.value?.querySelector<HTMLButtonElement>('.mobile-panel-controls button');
    void nextTick(() => target?.focus({ preventScroll: true }));
  }
};
const closeRight = (restore = false) => {
  if (isOverlayLayout()) rightDrawerOpen.value = false;
  else { rightCollapsed.value = true; persistPreferences(); }
  if (restore) void nextTick(() => rightDrawerButton.value?.focus());
};
const toggleRight = async () => {
  if (isOverlayLayout()) {
    rightDrawerOpen.value = !rightDrawerOpen.value;
    leftDrawerOpen.value = false;
    if (rightDrawerOpen.value) {
      await nextTick();
      rightPanel.value?.querySelector<HTMLElement>('button')?.focus();
    }
    return;
  }
  rightCollapsed.value = !rightCollapsed.value;
  persistPreferences();
};
const closeDrawers = () => { leftDrawerOpen.value = false; rightDrawerOpen.value = false; };
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
};
const onResize = (event: PointerEvent) => {
  if (resizeTarget === 'left') leftWidth.value = Math.min(340, Math.max(216, event.clientX));
  if (resizeTarget === 'right') rightWidth.value = Math.min(480, Math.max(320, window.innerWidth - event.clientX));
};
const onResizerKeydown = (target: ResizeTarget, event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const minimum = target === 'left' ? 216 : 320;
  const maximum = target === 'left' ? 340 : 480;
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
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((item) => item.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
};
const onShellKeydown = (event: KeyboardEvent) => {
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
    if (['dark', 'light', 'system'].includes(stored.theme)) theme.value = stored.theme;
    if (Number(stored.leftWidth)) leftWidth.value = Math.min(340, Math.max(216, Number(stored.leftWidth)));
    if (Number(stored.rightWidth)) rightWidth.value = Math.min(480, Math.max(320, Number(stored.rightWidth)));
    leftCollapsed.value = stored.leftCollapsed === true;
    rightCollapsed.value = stored.rightCollapsed === true;
  } catch {}
  media = window.matchMedia('(prefers-color-scheme: dark)');
  const syncTheme = () => { systemDark.value = media?.matches ?? true; };
  syncTheme();
  media.addEventListener('change', syncTheme);
  layoutMedia = window.matchMedia('(max-width: 1199px)');
  const syncLayout = () => {
    overlayLayout.value = layoutMedia?.matches ?? false;
    if (!overlayLayout.value) {
      leftDrawerOpen.value = false;
      rightDrawerOpen.value = false;
    }
  };
  syncLayout();
  layoutMedia.addEventListener('change', syncLayout);
  (root.value as HTMLElement & { __mediaCleanup?: () => void }).__mediaCleanup = () => {
    media?.removeEventListener('change', syncTheme);
    layoutMedia?.removeEventListener('change', syncLayout);
  };
  window.addEventListener('keydown', onShellKeydown);
});

watch(() => props.defaultInspectorTab, (value) => { activeTab.value = value; });
onBeforeUnmount(() => {
  endResize();
  window.removeEventListener('keydown', onShellKeydown);
  (root.value as (HTMLElement & { __mediaCleanup?: () => void }) | null)?.__mediaCleanup?.();
});
</script>

<style scoped>
.agent-workspace-shell {
  --bg: #0e100f;
  --sidebar: #151715;
  --surface: #1a1d1a;
  --surface-raised: #20231f;
  --border: #2b2f2a;
  --text: #f2f4ee;
  --muted: #929a8d;
  --muted-2: #8a9285;
  --acid: #c8ff3d;
  --acid-text: #c8ff3d;
  --acid-ink: #11140c;
  --danger: #ff6b62;
  --warning: #f1bd4f;
  --success: #69d59a;
  --font-meta: 11px;
  --font-control: 12px;
  --font-body: 14px;
  --left-live: var(--workspace-left-width);
  --right-live: var(--workspace-right-width);
  display: grid;
  grid-template-columns: var(--left-live) minmax(0, 1fr) var(--right-live);
  width: 100%;
  min-width: 0;
  height: 100dvh;
  overflow: hidden;
  color: var(--text);
  background: var(--bg);
  color-scheme: dark;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
}
.agent-workspace-shell[data-theme="light"] {
  --bg: #f7f8f4;
  --sidebar: #eef0ea;
  --surface: #fff;
  --surface-raised: #f5f6f1;
  --border: #d8ddd3;
  --text: #171a16;
  --muted: #667061;
  --muted-2: #626b5e;
  --acid-ink: #171a11;
  --acid-text: #426400;
  color: #171a16;
  color-scheme: light;
}
.agent-workspace-shell[data-theme="light"] .brand-lockup { color: #171a16; }
.agent-workspace-shell.left-collapsed { --left-live: 64px; }
.agent-workspace-shell.right-collapsed { --right-live: 0px; }
*,*::before,*::after { box-sizing: border-box; }
.agent-workspace-shell :deep(*),.agent-workspace-shell :deep(*::before),.agent-workspace-shell :deep(*::after) { box-sizing: border-box; }
button,input { font: inherit; }
button { color: inherit; }
svg { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.skip-link { position: fixed; top: 8px; left: 50%; z-index: 500; padding: 9px 14px; border-radius: 8px; color: var(--acid-ink); background: var(--acid); transform: translate(-50%,-150%); transition: transform 160ms ease; }
.skip-link:focus { transform: translate(-50%,0); }
.workspace-left,.workspace-right,.workspace-main { min-width: 0; min-height: 0; }
.workspace-left { z-index: 40; display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); background: var(--sidebar); }
.workspace-brand { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; min-height: 56px; padding: 8px 10px 8px 12px; }
.brand-lockup { display: flex; align-items: center; gap: 10px; min-width: 0; color: inherit; font-size: 14px; font-weight: 720; text-decoration: none; letter-spacing: -.01em; }
.brand-glyph { display: grid; flex: 0 0 auto; width: 28px; height: 28px; place-items: center; border: 1px solid color-mix(in srgb,var(--acid) 55%,var(--border)); border-radius: 8px; color: var(--acid-text); font-size: 12px; font-weight: 820; background: color-mix(in srgb,var(--acid) 7%,transparent); }
.brand-word { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-control { display: inline-grid; flex: 0 0 auto; width: 34px; height: 34px; padding: 0; place-items: center; border: 1px solid transparent; border-radius: 8px; color: var(--muted); background: transparent; cursor: pointer; }
.icon-control:hover { color: var(--text); background: var(--surface-raised); }
.icon-control:focus-visible,.new-task:focus-visible,.history-search:focus-within,.workspace-nav a:focus-visible,.workspace-account button:focus-visible,.inspector-tabs button:focus-visible,.command-palette button:focus-visible { outline: 2px solid var(--acid); outline-offset: 1px; }
.icon-control svg { width: 18px; height: 18px; }
.new-task { display: flex; flex: 0 0 auto; align-items: center; gap: 9px; min-height: 38px; margin: 2px 10px 8px; padding: 0 10px; border: 1px solid color-mix(in srgb,var(--acid) 34%,var(--border)); border-radius: 9px; color: var(--text); background: color-mix(in srgb,var(--acid) 7%,var(--surface)); cursor: pointer; }
.new-task:hover { border-color: color-mix(in srgb,var(--acid) 65%,var(--border)); background: color-mix(in srgb,var(--acid) 11%,var(--surface)); }
.new-task svg { width: 16px; }
.new-task span { flex: 1; text-align: left; font-size: 12px; font-weight: 690; }
kbd { padding: 1px 5px; border: 1px solid var(--border); border-radius: 5px; color: var(--muted-2); font-family: inherit; font-size: var(--font-meta); font-weight: 560; background: color-mix(in srgb,var(--surface) 75%,transparent); box-shadow: none; }
.history-search { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; min-height: 36px; margin: 0 10px 8px; padding: 0 9px; border: 1px solid transparent; border-radius: 8px; color: var(--muted); background: color-mix(in srgb,var(--surface) 72%,transparent); }
.history-search svg { width: 15px; }
.history-search input { width: 100%; min-width: 0; border: 0; outline: 0; color: var(--text); font-size: 11px; background: transparent; }
.history-search input::placeholder { color: var(--muted-2); }
.history-slot { flex: 1; min-height: 0; overflow: auto; padding: 2px 8px 10px; scrollbar-color: var(--border) transparent; }
.workspace-nav { display: grid; flex: 0 0 auto; gap: 2px; padding: 8px; border-top: 1px solid var(--border); }
.workspace-nav a { display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 0 9px; border-radius: 8px; color: var(--muted); font-size: 11px; text-decoration: none; }
.workspace-nav a:hover,.workspace-nav a.router-link-active { color: var(--text); background: var(--surface-raised); }
.workspace-nav svg { flex: 0 0 auto; width: 16px; }
.workspace-account { display: grid; flex: 0 0 auto; padding: 8px; border-top: 1px solid var(--border); }
.workspace-account button { display: flex; align-items: center; gap: 9px; min-height: 40px; padding: 4px 7px; border: 0; border-radius: 8px; text-align: left; background: transparent; cursor: pointer; }
.workspace-account button:hover { background: var(--surface-raised); }
.workspace-account button > span:last-child { display: grid; min-width: 0; gap: 1px; }
.workspace-account b { overflow: hidden; font-size: var(--font-control); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.workspace-account small { overflow: hidden; color: var(--muted-2); font-size: var(--font-meta); text-overflow: ellipsis; white-space: nowrap; }
.account-icon { display: grid; flex: 0 0 auto; width: 26px; height: 26px; place-items: center; border: 1px solid var(--border); border-radius: 7px; color: var(--muted); background: var(--surface); }
.account-icon svg { width: 14px; }
.left-collapsed .brand-word,.left-collapsed .workspace-brand .icon-control,.left-collapsed .new-task span,.left-collapsed .new-task kbd,.left-collapsed .history-search input,.left-collapsed .history-search kbd,.left-collapsed .history-slot,.left-collapsed .workspace-nav span,.left-collapsed .workspace-account button > span:last-child { display: none; }
.left-collapsed .workspace-brand { justify-content: center; padding-inline: 0; }
.left-collapsed .new-task,.left-collapsed .history-search,.left-collapsed .workspace-nav a,.left-collapsed .workspace-account button { justify-content: center; padding-inline: 0; }
.panel-resizer { position: fixed; top: 0; bottom: 0; z-index: 45; width: 5px; cursor: col-resize; }
.panel-resizer::after { position: absolute; top: 0; bottom: 0; left: 2px; width: 1px; background: transparent; content: ""; transition: background 150ms ease; }
.panel-resizer:hover::after { background: var(--acid); }
.panel-resizer:focus-visible { outline: 2px solid var(--acid); outline-offset: -1px; }
.panel-resizer:focus-visible::after { width: 2px; background: var(--acid); }
.left-resizer { left: calc(var(--left-live) - 2px); }
.right-resizer { right: calc(var(--right-live) - 2px); }
.left-collapsed .left-resizer,.right-collapsed .right-resizer { display: none; }
.workspace-main { position: relative; display: flex; flex-direction: column; background: var(--bg); }
.workspace-topbar { display: flex; flex: 0 0 auto; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px 8px 18px; overflow: hidden; border-bottom: 1px solid var(--border); background: color-mix(in srgb,var(--bg) 92%,transparent); }
.topbar-heading-slot { flex: 1 1 auto; min-width: 0; overflow: hidden; }
.task-heading { display: grid; min-width: 0; gap: 2px; }
.task-heading strong { overflow: hidden; font-size: 12px; font-weight: 680; text-overflow: ellipsis; white-space: nowrap; }
.task-heading span { overflow: hidden; color: var(--muted); font-size: var(--font-meta); text-overflow: ellipsis; white-space: nowrap; }
.topbar-actions,.mobile-panel-controls { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }
.runtime-pill { display: inline-flex; align-items: center; gap: 7px; min-height: 30px; padding: 0 9px; border: 1px solid var(--border); border-radius: 8px; color: var(--muted); font-size: var(--font-meta); font-weight: 620; white-space: nowrap; background: var(--surface); }
.runtime-pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.runtime-pill.ready i { background: var(--success); }.runtime-pill.busy i { background: var(--acid); box-shadow: 0 0 0 3px color-mix(in srgb,var(--acid) 14%,transparent); }.runtime-pill.warning i { background: var(--warning); }.runtime-pill.offline i { background: var(--danger); }
.main-slot { flex: 1; min-height: 0; overflow: hidden; }
.workspace-right { z-index: 40; display: flex; flex-direction: column; overflow: hidden; border-left: 1px solid var(--border); background: var(--sidebar); }
.right-collapsed .workspace-right { visibility: hidden; }
.inspector-head { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; min-height: 56px; padding: 8px 10px 8px 14px; border-bottom: 1px solid var(--border); }
.inspector-head > div { display: grid; min-width: 0; gap: 2px; }
.inspector-head span { font-size: var(--font-control); font-weight: 680; }
.inspector-head small { overflow: hidden; color: var(--muted); font-size: var(--font-meta); text-overflow: ellipsis; white-space: nowrap; }
.inspector-tabs { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); flex: 0 0 auto; min-height: 50px; border-bottom: 1px solid var(--border); }
.inspector-tabs button { position: relative; display: grid; min-width: 0; padding: 7px 2px 6px; overflow: hidden; place-items: center; gap: 3px; border: 0; border-bottom: 2px solid transparent; color: var(--muted); font-size: var(--font-meta); background: transparent; cursor: pointer; }
.inspector-tabs button:hover { color: var(--text); background: var(--surface); }
.inspector-tabs button.active { border-bottom-color: var(--acid); color: var(--text); }
.inspector-tabs svg { width: 15px; height: 15px; }
.inspector-tabs i { position: absolute; top: 4px; right: 5px; display: grid; min-width: 16px; height: 16px; padding: 0 4px; place-items: center; border-radius: 999px; color: var(--acid-ink); font-size: 11px; font-style: normal; background: var(--acid); }
.inspector-panel { flex: 1; min-height: 0; overflow: auto; padding: 12px; scrollbar-color: var(--border) transparent; }
.empty-panel { display: grid; min-height: 180px; place-content: center; place-items: center; gap: 6px; color: var(--muted); text-align: center; }
.empty-panel span { width: 22px; height: 1px; background: var(--border); }
.empty-panel b { font-size: var(--font-control); font-weight: 620; }.empty-panel small { max-width: 190px; color: var(--muted-2); font-size: var(--font-meta); line-height: 1.5; }
.drawer-scrim { display: none; }
.command-layer { position: fixed; inset: 0; z-index: 400; display: grid; padding-top: 15vh; place-items: start center; background: rgb(0 0 0 / 42%); backdrop-filter: blur(3px); }
.command-palette { width: min(560px,calc(100vw - 32px)); overflow: hidden; border: 1px solid color-mix(in srgb,var(--border) 80%,var(--acid)); border-radius: 12px; background: var(--surface); box-shadow: 0 24px 80px rgb(0 0 0 / 38%); }
.command-palette > label { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 13px; border-bottom: 1px solid var(--border); }
.command-palette > label svg { width: 17px; color: var(--muted); }.command-palette input { flex: 1; min-width: 0; border: 0; outline: 0; color: var(--text); font-size: 13px; background: transparent; }
.command-palette > div { max-height: 320px; overflow: auto; padding: 6px; }
.command-palette button { display: flex; width: 100%; align-items: center; justify-content: space-between; min-height: 48px; padding: 7px 9px; border: 0; border-radius: 8px; text-align: left; background: transparent; cursor: pointer; }
.command-palette button:hover { background: var(--surface-raised); }.command-palette button > span { display: grid; gap: 2px; }.command-palette b { font-size: var(--font-control); }.command-palette small { color: var(--muted); font-size: var(--font-meta); }
.mobile-only,.mobile-panel-controls { display: none; }
.sr-only { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
@media (max-width: 1199px) {
  .agent-workspace-shell,.agent-workspace-shell.left-collapsed,.agent-workspace-shell.right-collapsed { --left-live: 0px; --right-live: 0px; grid-template-columns: minmax(0,1fr); }
  .workspace-left,.workspace-right { position: fixed; top: 0; bottom: 0; visibility: hidden; pointer-events: none; transition: transform 190ms cubic-bezier(.2,.8,.2,1),visibility 0s linear 190ms; }
  .workspace-left { left: 0; width: min(320px,86vw); transform: translateX(-103%); box-shadow: 24px 0 64px rgb(0 0 0 / 35%); }
  .workspace-right { right: 0; width: min(420px,92vw); transform: translateX(103%); box-shadow: -24px 0 64px rgb(0 0 0 / 35%); }
  .left-drawer-open .workspace-left,.right-drawer-open .workspace-right { visibility: visible; pointer-events: auto; transform: translateX(0); transition-delay: 0s; }
  .drawer-scrim { position: fixed; inset: 0; z-index: 30; display: block; border: 0; background: rgb(0 0 0 / 44%); }
  .desktop-only { display: none !important; }.mobile-only,.mobile-panel-controls { display: flex; }
  .left-collapsed .brand-word,.left-collapsed .workspace-brand .icon-control,.left-collapsed .new-task span,.left-collapsed .new-task kbd,.left-collapsed .history-search input,.left-collapsed .history-search kbd,.left-collapsed .history-slot,.left-collapsed .workspace-nav span,.left-collapsed .workspace-account button > span:last-child { display: initial; }
  .left-collapsed .workspace-brand { justify-content: space-between; padding: 8px 10px 8px 12px; }.left-collapsed .new-task,.left-collapsed .history-search,.left-collapsed .workspace-nav a,.left-collapsed .workspace-account button { justify-content: flex-start; padding-inline: 9px; }
}
@media (max-width: 799px) {
  .workspace-topbar { min-height: 52px; gap: 4px; padding-inline: max(8px,env(safe-area-inset-left)) max(8px,env(safe-area-inset-right)); }.runtime-pill { display: none; }.inspector-toggle,.icon-control { min-width: 44px; min-height: 44px; }.workspace-brand { min-height: 56px; padding-top: max(8px,env(safe-area-inset-top)); }.new-task,.history-search,.workspace-nav a,.workspace-account button { min-height: 44px; }.workspace-account { padding-bottom: max(8px,env(safe-area-inset-bottom)); }
  .workspace-right { width: 100vw; }.inspector-tabs { min-height: 58px; }.inspector-tabs button { min-height: 56px; font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; transition-duration: 0s !important; animation-duration: 0s !important; animation-iteration-count: 1 !important; }
}
</style>

<style>
body.workspace-resizing { cursor: col-resize !important; user-select: none !important; }
</style>
