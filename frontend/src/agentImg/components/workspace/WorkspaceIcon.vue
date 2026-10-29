<template>
  <component :is="icons[name]" class="workspace-icon" :size="size" :stroke-width="1.75" aria-hidden="true" focusable="false" />
</template>

<script setup lang="ts">
import { PanelLeft, PanelRight, X, Plus, Minus, Search, Folder, Wrench, Image, Sparkles, Moon, Sun, Monitor, Settings, SquareTerminal, List, Network, Bot, GitBranch, FileText, Paperclip, ArrowUp, RefreshCw, ArrowRight, ArrowDown, ChevronRight, ChevronDown, Trash2, Download, Play, Square, Pause, Send, Copy, Check } from '@lucide/vue';

const icons = {
  'panel-left': PanelLeft,
  'panel-right': PanelRight,
  'close': X,
  'plus': Plus,
  'minus': Minus,
  'search': Search,
  'folder': Folder,
  'tools': Wrench,
  'image': Image,
  'spark': Sparkles,
  'moon': Moon,
  'sun': Sun,
  'monitor': Monitor,
  'settings': Settings,
  'terminal': SquareTerminal,
  'list': List,
  'subagents': Network,
  'agent': Bot,
  'git': GitBranch,
  'file': FileText,
  'attachment': Paperclip,
  'send': ArrowUp,
  'refresh': RefreshCw,
  'arrow-right': ArrowRight,
  'arrow-down': ArrowDown,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'trash': Trash2,
  'download': Download,
  'play': Play,
  'stop': Square,
  'pause': Pause,
  'paper-plane': Send,
  'copy': Copy,
  'check': Check,
} as const;

withDefaults(defineProps<{
  name: keyof typeof icons;
  size?: 14 | 16 | 18 | 20;
}>(), { size: 16 });
</script>

<style scoped>
.workspace-icon { display: block; flex: 0 0 auto; }
</style>
