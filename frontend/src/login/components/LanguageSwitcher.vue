<template>
  <div class="lang-switcher" @click="toggleLanguage">
    <div class="lang-icon">
      <i class="fas fa-globe"></i>
    </div>
    <span class="lang-text">{{ currentLang === 'zh' ? 'EN' : '中' }}</span>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const { toggleLanguage } = languageStore;
</script>

<style scoped>
.lang-switcher {
  display: none !important;
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 100;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
}

.lang-switcher:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.lang-switcher:active {
  transform: translateY(0);
}

.lang-icon {
  font-size: 14px;
  opacity: 0.8;
}

.lang-text {
  font-weight: 600;
  letter-spacing: 1px;
}
</style>
