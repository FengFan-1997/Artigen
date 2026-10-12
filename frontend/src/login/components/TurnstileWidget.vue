<template>
  <div
    v-if="siteKey || allowFallback"
    class="turnstile-wrap"
    :class="{ failed: loadFailed }"
    aria-live="polite"
  >
    <div v-if="siteKey" ref="containerRef"></div>
    <div v-if="siteKey && loadFailed" class="turnstile-error" role="alert">
      <span>
        {{ isZh ? '安全验证加载失败，请检查网络后重试' : 'Security check failed to load.' }}
      </span>
      <button type="button" class="turnstile-retry" :disabled="loading" @click="retry">
        {{ isZh ? '重新加载' : 'Retry' }}
      </button>
    </div>
    <div v-if="allowFallback" class="turnstile-fallback-row">
      <button
        class="turnstile-fallback"
        :class="{ selected: fallbackSelected }"
        type="button"
        :aria-pressed="fallbackSelected"
        @click="emit('update:fallbackSelected', !fallbackSelected)"
      >
        {{
          fallbackSelected
            ? isZh
              ? '已选择直接发送验证码'
              : 'Direct email-code fallback selected'
            : isZh
              ? '验证不可用？直接发送验证码'
              : 'Can’t verify? Send the email code directly'
        }}
      </button>
      <small v-if="fallbackSelected">
        {{
          isZh
            ? '仍受邮箱、IP 和全局发送限额保护。'
            : 'Email, IP, and global sending limits still apply.'
        }}
      </small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { loadTurnstile, resetTurnstileLoader, turnstileSiteKey } from '../turnstile';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    action?: string;
    allowFallback?: boolean;
    fallbackSelected?: boolean;
  }>(),
  { action: 'email_otp', allowFallback: false, fallbackSelected: false }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:fallbackSelected': [value: boolean];
}>();

const siteKey = turnstileSiteKey();
const containerRef = ref<HTMLDivElement | null>(null);
const loadFailed = ref(false);
const loading = ref(false);
let widgetId: string | number | null = null;
let renderRevision = 0;

const isZh = computed(() => {
  try {
    return String(window.localStorage.getItem('app_lang') || 'zh').startsWith('zh');
  } catch {
    return true;
  }
});

const reset = () => {
  emit('update:modelValue', '');
  try {
    if (widgetId !== null) (window as any).turnstile?.reset(widgetId);
  } catch {}
};

const removeWidget = () => {
  try {
    if (widgetId !== null) (window as any).turnstile?.remove(widgetId);
  } catch {}
  widgetId = null;
  if (containerRef.value) containerRef.value.innerHTML = '';
};

const render = async () => {
  if (!siteKey) return;
  const revision = ++renderRevision;
  loading.value = true;
  loadFailed.value = false;
  try {
    await loadTurnstile();
    await nextTick();
    if (revision !== renderRevision) return;
    const api = (window as any).turnstile;
    if (!containerRef.value || !api?.render) throw new Error('TURNSTILE_LOAD_FAILED');
    removeWidget();
    widgetId = api.render(containerRef.value, {
      sitekey: siteKey,
      action: props.action,
      theme: 'dark',
      appearance: 'interaction-only',
      callback: (token: string) => emit('update:modelValue', String(token || '').trim()),
      'expired-callback': () => emit('update:modelValue', ''),
      'timeout-callback': () => emit('update:modelValue', ''),
      'error-callback': () => {
        emit('update:modelValue', '');
        loadFailed.value = true;
      }
    });
  } catch {
    if (revision !== renderRevision) return;
    loadFailed.value = true;
    emit('update:modelValue', '');
  } finally {
    if (revision === renderRevision) loading.value = false;
  }
};

const retry = async () => {
  emit('update:modelValue', '');
  removeWidget();
  resetTurnstileLoader();
  await render();
};

onMounted(() => void render());

onBeforeUnmount(() => {
  renderRevision += 1;
  removeWidget();
});

defineExpose({ reset, retry });
</script>

<style scoped>
.turnstile-wrap {
  min-height: 44px;
  margin: 4px 0 12px;
}

.turnstile-wrap.failed {
  min-height: 0;
}

.turnstile-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #fca5a5;
  font-size: 12px;
  line-height: 1.5;
}

.turnstile-retry {
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid currentColor;
  border-radius: 8px;
  color: #fca5a5;
  background: transparent;
  cursor: pointer;
}

.turnstile-retry:disabled {
  cursor: wait;
  opacity: 0.6;
}

.turnstile-fallback-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0 0 12px;
}

.turnstile-fallback {
  min-height: 28px;
  padding: 2px 0;
  border: 0;
  color: #9ca3af;
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.turnstile-fallback:hover,
.turnstile-fallback.selected {
  color: #d1d5db;
}

.turnstile-fallback-row small {
  flex-basis: 100%;
  color: #9ca3af;
  font-size: 11px;
  line-height: 1.45;
}
</style>
