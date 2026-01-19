<template>
  <div class="legal-page">
    <TitleBar />

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
import TitleBar from '../../components/TitleBar.vue';

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const ui = computed(() =>
  currentLang.value === 'zh'
    ? {
        navFormatFactory: '工具',
        navAiWorkshop: 'AI 设计',
        navMarket: '点数商城',
        portfolio: '作品集',
        title: '退款政策',
        updatedAt: '最后更新: 2025-12-30',
        intro: '我们理解数字化服务的购买需要信任。本政策说明点数/订阅类服务的退款规则与申请方式。',
        sections: [
          {
            title: '1. 适用范围',
            paragraphs: [
              '本政策适用于在「点数商城」购买的点数/积分等数字化权益。',
              '对第三方支付平台收取的手续费用、汇率差异或银行侧费用，可能无法完全退还（以实际发生为准）。'
            ]
          },
          {
            title: '2. 退款条件（一般规则）',
            paragraphs: [
              '在购买后 14 天内，如点数未被使用，可申请退款；我们将在核验订单信息后按原支付路径退回。',
              '已消耗的点数一般不支持退款。若发生明显系统故障导致的重复扣费/异常扣费，我们会优先安排更正或补偿。'
            ]
          },
          {
            title: '3. 如何申请退款',
            paragraphs: [
              '请发送邮件至 sorates1997@163.com，并提供：订单号、购买时间、登录账号标识（如有）、退款原因简述。',
              '我们通常会在合理时间内回复并告知处理进度。退款到账时间取决于支付渠道与银行处理周期。'
            ]
          },
          {
            title: '4. 例外与风控',
            paragraphs: [
              '为防止滥用、欺诈或恶意退款，我们可能拒绝明显异常的退款请求（例如：频繁重复购买后退款、疑似盗刷、违反条款的行为）。',
              '超过 14 天的订单通常视为最终销售。'
            ]
          }
        ],
        contactLabel: '如有疑问，请联系'
      }
    : {
        navFormatFactory: 'Tools',
        navAiWorkshop: 'AI Design',
        navMarket: 'Compute Market',
        portfolio: 'PORTFOLIO',
        title: 'Refund Policy',
        updatedAt: 'Last updated: 2025-12-30',
        intro:
          'We understand that purchasing digital services requires trust. This policy explains how refunds work for credits and related digital entitlements.',
        sections: [
          {
            title: '1. Scope',
            paragraphs: [
              'This policy applies to credits/points purchased through the Compute Market.',
              'Payment processing fees, FX differences, or bank-side fees may not be fully refundable depending on the payment provider.'
            ]
          },
          {
            title: '2. Eligibility (General Rules)',
            paragraphs: [
              'Within 14 days of purchase, you may request a refund if the purchased credits have not been used. After verification, we will refund via the original payment method.',
              'Consumed credits are generally non-refundable. If a clear system issue causes duplicate or incorrect charges, we will prioritize correction or compensation.'
            ]
          },
          {
            title: '3. How to Request a Refund',
            paragraphs: [
              'Email sorates1997@163.com with your order number, purchase time, account identifier (if applicable), and a brief reason.',
              'We will respond within a reasonable timeframe. The time for funds to appear depends on your payment provider and bank processing.'
            ]
          },
          {
            title: '4. Exceptions & Abuse Prevention',
            paragraphs: [
              'To prevent fraud and abuse, we may deny clearly abnormal refund requests (e.g., repeated purchase-and-refund patterns, suspected unauthorized payments, or violations of the Terms).',
              'After 14 days, purchases are generally considered final.'
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
