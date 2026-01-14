<template>
  <footer class="global-footer">
    <div class="footer-content">
      <div class="footer-left">
        <div class="footer-logo">Artigen</div>
        <div class="copyright">{{ ui.copyright }}</div>
      </div>

      <div class="footer-links">
        <router-link to="/artigen/legal/terms">{{ ui.terms }}</router-link>
        <router-link to="/artigen/legal/privacy">{{ ui.privacy }}</router-link>
        <router-link to="/artigen/legal/refund">{{ ui.refund }}</router-link>
        <a href="mailto:sorates1997@163.com">{{ ui.contact }}</a>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        terms: '服务条款',
        privacy: '隐私政策',
        refund: '退款政策',
        contact: '联系我们',
        copyright: '© 2024 Artigen. 保留所有权利。'
      }
    : {
        terms: 'Terms',
        privacy: 'Privacy',
        refund: 'Refund',
        contact: 'Contact',
        copyright: '© 2024 Artigen. All rights reserved.'
      }
);
</script>

<style scoped>
.global-footer {
  width: 100%;
  padding: 40px 60px;
  background: #050505;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-family: var(--common-font);
}

.footer-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-logo {
  font-family: var(--common-font);
  font-weight: 900;
  font-size: 18px;
  color: #ccff00;
  margin-bottom: 8px;
}

.copyright {
  font-size: 12px;
  color: #64748b;
}

.footer-links {
  display: flex;
  gap: 32px;
}

.footer-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 12px;
  transition: all 0.2s;
  position: relative;
  padding-bottom: 2px;
}

.footer-links a::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 1px;
  background-color: #ccff00;
  transition: width 0.3s ease;
}

.footer-links a:hover {
  color: #ccff00;
}

.footer-links a:hover::after {
  width: 100%;
}

@media (max-width: 768px) {
  .footer-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 24px;
  }

  .footer-links {
    flex-wrap: wrap;
    gap: 20px;
  }
}
</style>
