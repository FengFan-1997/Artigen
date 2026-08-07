<template>
  <div v-if="open" class="generation-quote-overlay" role="presentation" @click.self="emit('cancel')">
    <section
      ref="dialogRef"
      class="generation-quote-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      @keydown.esc.prevent="emit('cancel')"
      @keydown.tab="trapFocus"
    >
      <div class="generation-quote-kicker">{{ copy.kicker }}</div>
      <h2 :id="titleId">{{ title }}</h2>
      <div class="generation-quote-price"><span>⚡</span>{{ credits }}</div>
      <p>{{ copy.description }}</p>
      <p class="generation-quote-refund">{{ copy.refund }}</p>
      <div class="generation-quote-actions">
        <button type="button" class="generation-quote-cancel" @click="emit('cancel')">
          {{ copy.cancel }}
        </button>
        <button ref="confirmRef" type="button" class="generation-quote-confirm" @click="emit('confirm')">
          {{ copy.confirm }} · ⚡{{ credits }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  language: string;
  operation: 'directions' | 'generate';
  credits: number;
}>();

const emit = defineEmits<{
  (event: 'confirm'): void;
  (event: 'cancel'): void;
}>();

const titleId = 'generation-quote-title';
const dialogRef = ref<HTMLElement | null>(null);
const confirmRef = ref<HTMLButtonElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

watch(
  () => props.open,
  (open) => {
    if (open) {
      previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void nextTick(() => (confirmRef.value || dialogRef.value)?.focus());
      return;
    }
    previouslyFocused?.focus();
    previouslyFocused = null;
  }
);

onBeforeUnmount(() => {
  previouslyFocused?.focus();
  previouslyFocused = null;
});

const trapFocus = (event: KeyboardEvent) => {
  const buttons = Array.from(
    dialogRef.value?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]') || []
  );
  if (!buttons.length) return;
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
const title = computed(() => {
  if (props.language === 'zh') return props.operation === 'directions' ? '分析 4 个视觉方向' : '生成 1 张图片';
  return props.operation === 'directions' ? 'Analyze four visual directions' : 'Generate one image';
});

const copy = computed(() =>
  props.language === 'zh'
    ? {
        kicker: '服务端报价',
        description: '确认后才会创建任务。当前报价只适用于本次操作，不会自动执行下一步。',
        refund: '仅在输出通过验证并安全保存后结算；失败、取消或无效输出会释放全部预占点数。',
        cancel: '暂不生成',
        confirm: '确认'
      }
    : {
        kicker: 'Server quote',
        description: 'A task is created only after confirmation. This quote applies to this operation and never runs the next step automatically.',
        refund: 'Credits settle only after a valid output is safely stored. Failures, cancellations, and invalid outputs release the full hold.',
        cancel: 'Not now',
        confirm: 'Confirm'
      }
);
</script>

<style scoped>
.generation-quote-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.76);
  backdrop-filter: blur(8px);
}

.generation-quote-dialog {
  width: min(440px, 100%);
  padding: 24px;
  border: 1px solid rgba(200, 255, 61, 0.35);
  border-radius: 16px;
  background: #0b0d0e;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7);
  color: #f5f7f2;
}

.generation-quote-kicker {
  color: #c8ff3d;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 8px 0 12px;
  font-size: 22px;
}

.generation-quote-price {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: #c8ff3d;
  font-size: 34px;
  font-weight: 900;
}

p {
  margin: 0 0 10px;
  color: rgba(245, 247, 242, 0.72);
  font-size: 14px;
  line-height: 1.6;
}

.generation-quote-refund {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(200, 255, 61, 0.07);
  color: rgba(234, 255, 179, 0.86);
  font-size: 12px;
}

.generation-quote-actions {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 10px;
  margin-top: 20px;
}

.generation-quote-actions button {
  min-height: 46px;
  border-radius: 10px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.generation-quote-cancel {
  border: 1px solid rgba(245, 247, 242, 0.16);
  background: transparent;
  color: rgba(245, 247, 242, 0.76);
}

.generation-quote-confirm {
  border: 1px solid #c8ff3d;
  background: #c8ff3d;
  color: #0b0d0e;
}
</style>
