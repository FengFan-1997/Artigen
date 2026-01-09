<template>
  <div class="legal-page">
    <header class="top-header">
      <div class="top-header-inner">
        <router-link to="/artigen" class="top-logo">
          <span class="top-logo-text">Artigen</span>
        </router-link>

        <nav class="top-nav">
          <router-link to="/artigen/format-factory" class="top-nav-item">{{
            ui.navFormatFactory
          }}</router-link>
          <router-link to="/artigen/ai" class="top-nav-item">{{ ui.navAiWorkshop }}</router-link>
          <router-link to="/artigen/market" class="top-nav-item">{{ ui.navMarket }}</router-link>
        </nav>

        <div class="top-actions">
          <router-link to="/" class="top-action-link">{{ ui.portfolio }}</router-link>
        </div>
      </div>
    </header>

    <div class="legal-container">
      <header class="legal-header">
        <h1>{{ ui.title }}</h1>
        <p class="subtitle">{{ ui.updatedAt }}</p>
      </header>

      <div class="legal-content">
        <p class="intro">{{ ui.intro }}</p>

        <section v-for="(section, idx) in ui.sections" :key="idx">
          <h2>{{ section.title }}</h2>
          <p v-for="(line, lineIdx) in section.paragraphs" :key="lineIdx">{{ line }}</p>
        </section>

        <div class="contact-box">
          {{ ui.contactLabel }}: <span class="highlight">sorates1997@163.com</span>
        </div>
      </div>
    </div>
    <GlobalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useLanguageStore } from '@/stores/language';
import GlobalFooter from '../../components/GlobalFooter.vue';

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        navFormatFactory: '格式工厂',
        navAiWorkshop: 'AI工坊',
        navMarket: '算力商城',
        portfolio: '作品集',
        title: '退款政策',
        updatedAt: '最后更新: 2025-12-30',
        intro: '在「Artigen」，我们致力于提供透明、公平的退款体验。请在购买前仔细阅读本政策。',
        sections: [
          {
            title: '14 天无理由退款',
            paragraphs: ['我们提供购买后 14 天内的全额退款，前提是积分尚未被使用。']
          },
          {
            title: '如何申请退款',
            paragraphs: [
              '如果您在 14 天内且未使用已购积分，请发送邮件至 sorates1997@163.com 并附上您的订单号。我们将通过原支付方式处理退款。'
            ]
          },
          {
            title: '例外情况',
            paragraphs: [
              '如果您已使用购买的任何积分，我们保留拒绝退款请求或酌情提供部分退款的权利。超过 14 天后，所有销售均为最终销售。'
            ]
          }
        ],
        contactLabel: '如有疑问，请联系'
      }
    : {
        navFormatFactory: 'Format Factory',
        navAiWorkshop: 'AI Workshop',
        navMarket: 'Compute Market',
        portfolio: 'PORTFOLIO',
        title: 'Refund Policy',
        updatedAt: 'Last updated: 2025-12-30',
        intro:
          'At Artigen, we aim to provide a transparent and fair refund experience. Please read this policy carefully before purchasing.',
        sections: [
          {
            title: '14-Day Refund',
            paragraphs: [
              'We offer a full refund within 14 days of purchase, provided the points have not been used.'
            ]
          },
          {
            title: 'How to Request a Refund',
            paragraphs: [
              'If you are within 14 days and have not used the purchased points, email sorates1997@163.com with your order number. Refunds will be processed to the original payment method.'
            ]
          },
          {
            title: 'Exceptions',
            paragraphs: [
              'If you have used any purchased points, we may deny the refund request or provide a partial refund at our discretion. After 14 days, all sales are final.'
            ]
          }
        ],
        contactLabel: 'Questions? Contact'
      }
);
</script>

<style scoped>
.legal-page {
  min-height: 100vh;
  background-color: #050505;
  color: #f1f5f9;
  font-family: 'Inter', sans-serif;
  padding-top: 120px;
}

.top-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  background: rgba(5, 5, 5, 0.7);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.top-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.top-logo {
  text-decoration: none;
}

.top-logo-text {
  font-weight: 900;
  font-size: 18px;
  color: #ccff00;
  letter-spacing: -0.5px;
}

.top-nav {
  display: flex;
  gap: 18px;
  align-items: center;
}

.top-nav-item {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-nav-item:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-action-link {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-action-link:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.legal-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 24px;
}

.legal-header {
  margin-bottom: 60px;
}

h1 {
  font-size: 48px;
  font-weight: 900;
  color: #ccff00;
  margin-bottom: 16px;
  letter-spacing: -1px;
}

.subtitle {
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
}

.intro {
  margin-bottom: 40px;
  font-size: 16px;
  color: #fff;
}

.legal-content section {
  margin-bottom: 40px;
}

h2 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #fff;
}

p {
  line-height: 1.8;
  color: #cbd5e1;
  font-size: 15px;
}

.contact-box {
  margin-top: 60px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  color: #94a3b8;
}

.highlight {
  color: #ccff00;
}
</style>
