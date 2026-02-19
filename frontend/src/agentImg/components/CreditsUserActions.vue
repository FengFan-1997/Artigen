<template>
  <template v-if="isAuthed">
    <div ref="containerRef" class="credits-container">
      <button class="credits-btn" type="button" @click="togglePopover" :disabled="creditsLoading">
        <span class="credits-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            width="16"
            height="16"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </span>
        <span class="credits-value">{{ creditsText }}</span>
      </button>

      <transition name="dropdown-fade">
        <div v-if="popoverOpen" class="credits-popover" @click.stop>
          <div class="credits-pop-head">
            <div class="credits-pop-title">{{ labels.creditsBalance }}</div>
            <div class="credits-pop-total">{{ labels.totalCredits }}: {{ totalCreditsText }}</div>
          </div>
          <div class="credits-pop-balance">
            <span class="credits-pop-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                width="16"
                height="16"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </span>
            <span class="credits-pop-value">{{ creditsText }}</span>
          </div>
          <div class="credits-pop-actions">
            <button
              class="credits-pop-btn"
              type="button"
              @click="handleRefresh"
              :disabled="creditsLoading"
            >
              {{ labels.refreshCredits }}
            </button>
            <button
              class="credits-pop-btn credits-pop-btn--primary"
              type="button"
              @click="handleGoMarket"
            >
              {{ labels.goMarket }}
            </button>
          </div>
        </div>
      </transition>
    </div>

    <div class="user-menu">
      <button class="avatar-btn" type="button" @click="handleOpenAccountPopup">
        <span class="avatar-text">{{ avatarText }}</span>
      </button>
    </div>
  </template>

  <button v-else class="login-btn nth-login-btn" type="button" @click="handleLoginClick">
    {{ labels.loginOrRegister }}
  </button>

  <slot />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAgentImgLocale } from '../composables/useAgentImgLocale';

const props = defineProps<{
  isAuthed: boolean;
  avatarText?: string;
  creditsText?: string;
  totalCreditsText?: string;
  creditsLoading?: boolean;
  onRefreshCredits?: () => void | Promise<void>;
  onGoMarket?: () => void;
  onOpenAccountPopup?: () => void;
  onLoginClick?: () => void;
}>();

const { ui } = useAgentImgLocale();

const labels = computed(() => {
  return {
    creditsBalance: ui.value.creditsBalance,
    totalCredits: ui.value.totalCredits,
    refreshCredits: ui.value.refreshCredits,
    goMarket: ui.value.goMarket,
    loginOrRegister: ui.value.loginOrRegister
  };
});

const avatarText = computed(() => String(props.avatarText ?? '?'));
const creditsText = computed(() => String(props.creditsText ?? '--'));
const totalCreditsText = computed(() => String(props.totalCreditsText ?? '--'));
const creditsLoading = computed(() => !!props.creditsLoading);

const popoverOpen = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const closePopover = () => {
  popoverOpen.value = false;
};

const togglePopover = () => {
  popoverOpen.value = !popoverOpen.value;
  if (popoverOpen.value) void props.onRefreshCredits?.();
};

const handleRefresh = () => {
  void props.onRefreshCredits?.();
};

const handleGoMarket = () => {
  closePopover();
  props.onGoMarket?.();
};

const handleOpenAccountPopup = () => {
  props.onOpenAccountPopup?.();
};

const handleLoginClick = () => {
  props.onLoginClick?.();
};

const onDocMouseDown = (e: MouseEvent) => {
  if (!popoverOpen.value) return;
  const target = e.target;
  if (!(target instanceof Node)) return;
  const el = containerRef.value;
  if (el && el.contains(target)) return;
  closePopover();
};

onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown);
});

watch(
  () => props.isAuthed,
  (v) => {
    if (!v) closePopover();
  }
);
</script>

<style scoped>
.credits-btn {
  height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(204, 255, 0, 0.28);
  background: rgba(204, 255, 0, 0.08);
  color: rgba(241, 245, 249, 0.95);
  font-family: var(--common-font);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.credits-btn:hover:not(:disabled) {
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(204, 255, 0, 0.12);
}

.credits-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.credits-icon {
  line-height: 1;
}

.credits-value {
  color: var(--primary, #ccff00);
  font-weight: 800;
}

.credits-container {
  position: relative;
  display: inline-flex;
}

.credits-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 280px;
  border-radius: 14px;
  padding: 12px;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  z-index: 30;
}
@media (max-width: 350px) {
  .credits-popover {
    right: -41px;
  }
}
.credits-pop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: rgba(241, 245, 249, 0.86);
  font-size: 12px;
}

.credits-pop-title {
  font-weight: 700;
}

.credits-pop-total {
  color: rgba(148, 163, 184, 0.95);
}

.credits-pop-balance {
  margin-top: 10px;
  border-radius: 12px;
  padding: 12px 12px;
  background: rgba(204, 255, 0, 0.08);
  border: 1px solid rgba(204, 255, 0, 0.18);
  display: flex;
  align-items: center;
  gap: 10px;
}

.credits-pop-icon {
  line-height: 1;
}

.credits-pop-value {
  color: rgba(241, 245, 249, 0.95);
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.3px;
}

.credits-pop-actions {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.credits-pop-btn {
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(241, 245, 249, 0.92);
  font-family: var(--common-font);
  font-weight: 700;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.credits-pop-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.credits-pop-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.credits-pop-btn--primary {
  border-color: rgba(204, 255, 0, 0.28);
  background: rgba(204, 255, 0, 0.1);
  color: rgba(241, 245, 249, 0.95);
}

.credits-pop-btn--primary:hover {
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(204, 255, 0, 0.14);
}

.user-menu {
  position: relative;
  display: inline-flex;
}

.avatar-btn {
  width: 38px;
  height: 38px;
  border: 1px solid rgba(204, 255, 0, 0.28);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(241, 245, 249, 0.92);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.avatar-btn:hover {
  border-color: rgba(204, 255, 0, 0.55);
  background: rgba(255, 255, 255, 0.06);
}

.avatar-text {
  font-family: var(--common-font);
  font-weight: 900;
  letter-spacing: 0.4px;
}

.login-btn {
  background: transparent;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  color: var(--text-main, #f1f5f9);
  padding: 8px 20px;
  font-family: var(--common-font);
  font-size: 14px;
  letter-spacing: 1px;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.login-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(204, 255, 0, 0.2), transparent);
  transition: left 0.5s;
}

.login-btn:hover {
  border-color: var(--primary, #ccff00);
  color: var(--primary, #ccff00);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.15);
}

.login-btn:hover::before {
  left: 100%;
}

@media (max-width: 980px) {
  .login-btn {
    padding: 7px 14px;
    font-size: 13px;
    letter-spacing: 0.5px;
  }
}

@media (max-width: 360px) {
  .login-btn {
    padding: 7px 10px;
  }
}
</style>
