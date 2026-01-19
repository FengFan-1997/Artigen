<template>
  <div class="legal-page">
    <TitleBar />

    <div class="legal-container">
      <header class="legal-header">
        <h1>{{ ui.title }}</h1>
        <p class="subtitle">{{ ui.updatedAt }}</p>
      </header>

      <div class="legal-content">
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
        title: '隐私政策',
        updatedAt: '最后更新: 2026-01-19',
        sections: [
          {
            title: '1. 概览与适用范围',
            paragraphs: [
              '本隐私政策说明 Artigen 如何收集、使用、披露与保护您的信息。',
              '通过访问或使用本平台，即表示您已阅读并同意本政策。若不同意，请停止使用服务。'
            ]
          },
          {
            title: '2. 我们收集的信息',
            paragraphs: [
              '个人信息可能包括：姓名、头像、邮箱、电话、支付信息、IP 等可用于识别个人的数据。',
              '为提供服务，您可能需要提交邮箱、姓名或国家/地区信息；如涉及第三方个人信息，请确保已取得授权。',
              '我们还会收集非个人信息，例如浏览器类型、语言、设备信息、访问时间、页面行为与错误日志。'
            ]
          },
          {
            title: '3. 信息来源',
            paragraphs: [
              '您在注册、登录、购买或使用功能时主动提供的信息。',
              '您在使用过程中自动产生的设备、日志与使用行为信息。'
            ]
          },
          {
            title: '4. 信息使用目的',
            paragraphs: [
              '提供与维护服务：完成登录、订单、支付、内容生成与结果交付。',
              '回应您提出的问题或支持请求。',
              '优化体验与功能：分析使用情况、改进性能与安全性。',
              '向您发送必要的服务通知、政策更新或活动信息。'
            ]
          },
          {
            title: '5. Cookies 与日志信息',
            paragraphs: [
              '我们可能使用 Cookie 或本地存储技术以提升体验与保持登录状态。',
              '我们会收集日志信息，例如 IP 地址、浏览器类型、设备信息、访问时间、点击流等，用于分析与改进服务。'
            ]
          },
          {
            title: '6. 信息共享与披露',
            paragraphs: [
              '我们不会出售或出租您的个人信息。',
              '我们可能与员工、代理或关联方共享必要信息，以提供服务并遵守本政策。',
              '除非法律要求或为履行您请求的服务，否则不会向第三方披露您的个人信息。'
            ]
          },
          {
            title: '7. 数据保留',
            paragraphs: [
              '我们仅在达成服务目的所需的期限内保留您的信息。',
              '当法律或合规要求保留更长时间时，我们将在必要范围内进行保留。'
            ]
          },
          {
            title: '8. 安全措施',
            paragraphs: [
              '我们采取合理的管理、物理与技术措施保护数据安全。',
              '互联网传输并非绝对安全，您理解并承担相应风险。'
            ]
          },
          {
            title: '9. 您的权利',
            paragraphs: [
              '您可请求访问、更正或删除与账户相关的信息。',
              '您可在合规范围内撤回同意或限制特定处理。',
              '如需行使权利，请通过下方联系方式联系我们。'
            ]
          },
          {
            title: '10. 第三方服务',
            paragraphs: [
              '我们可能使用第三方服务用于分析、支付或模型能力支持。',
              '第三方服务将遵循其各自的隐私政策，我们会尽量限制共享范围，仅传输完成服务所必需的数据。'
            ]
          },
          {
            title: '11. 未成年人保护',
            paragraphs: [
              '我们不主动收集未成年人个人信息。若您未满 18 岁，请不要向我们提交个人信息。',
              '如发现未成年人信息被提交，我们将尽快采取措施删除。'
            ]
          },
          {
            title: '12. 跨境传输',
            paragraphs: [
              '我们的服务可能在不同地区提供，信息可能在您所在地以外处理或存储。',
              '我们将采取合理措施确保跨境传输符合法律要求。'
            ]
          },
          {
            title: '13. 账户与数据删除',
            paragraphs: [
              '如您希望删除账户及相关数据，可通过下方联系方式联系我们。',
              '在完成身份核验后，我们将尽快处理您的删除请求。'
            ]
          },
          {
            title: '14. 政策更新',
            paragraphs: ['我们可能不时更新本隐私政策。更新后继续使用服务即视为同意更新内容。']
          }
        ],
        contactLabel: '如有隐私相关问题，请联系'
      }
    : {
        navFormatFactory: 'Tools',
        navAiWorkshop: 'AI Design',
        navMarket: 'Compute Market',
        portfolio: 'PORTFOLIO',
        title: 'Privacy Policy',
        updatedAt: 'Last updated: 2026-01-19',
        sections: [
          {
            title: '1. Overview & Scope',
            paragraphs: [
              'This Privacy Policy explains how Artigen collects, uses, discloses, and safeguards your information.',
              'By accessing or using the service, you agree to this policy. If you do not agree, please stop using the service.'
            ]
          },
          {
            title: '2. Information We Collect',
            paragraphs: [
              'Personal information may include your name, profile photo, email address, phone number, payment details, and IP address.',
              'To provide the service, we may ask for your email, name, or country/region. If you provide third‑party data, ensure you have proper consent.',
              'We also collect non‑personal information such as browser type, language, device information, time stamps, and usage logs.'
            ]
          },
          {
            title: '3. Sources of Information',
            paragraphs: [
              'Information you provide during registration, login, purchases, or feature usage.',
              'Information generated automatically through your use of the service.'
            ]
          },
          {
            title: '4. How We Use Information',
            paragraphs: [
              'Provide and maintain the service, including authentication, orders, payments, and result delivery.',
              'Respond to your inquiries and support requests.',
              'Improve performance, security, and user experience.',
              'Send service notices, policy updates, or campaign information when appropriate.'
            ]
          },
          {
            title: '5. Cookies & Log Data',
            paragraphs: [
              'We may use cookies or local storage to keep you signed in and improve functionality.',
              'We collect log data such as IP addresses, browser types, device information, timestamps, and click‑stream data for analytics and service improvement.'
            ]
          },
          {
            title: '6. Information Sharing',
            paragraphs: [
              'We do not sell or rent your personal information.',
              'We may share necessary information with employees, agents, or affiliates to provide the service under this policy.',
              'We disclose information only when required by law or to fulfill your requested services.'
            ]
          },
          {
            title: '7. Data Retention',
            paragraphs: [
              'We retain information only for as long as necessary to fulfill the purposes described in this policy.',
              'We may keep certain records longer when required by law or compliance obligations.'
            ]
          },
          {
            title: '8. Security Measures',
            paragraphs: [
              'We use reasonable administrative, physical, and technical safeguards to protect your information.',
              'No internet transmission is completely secure, and you acknowledge the inherent risks.'
            ]
          },
          {
            title: '9. Your Rights',
            paragraphs: [
              'You may request access to, correction of, or deletion of your account information.',
              'You may withdraw consent or limit certain processing where permitted by law.',
              'Please contact us using the details below to exercise these rights.'
            ]
          },
          {
            title: '10. Third‑Party Services',
            paragraphs: [
              'We may use third‑party providers for analytics, payment processing, or model capabilities.',
              'These providers are subject to their own privacy policies, and we limit data sharing to what is necessary to deliver the service.'
            ]
          },
          {
            title: '11. Children’s Privacy',
            paragraphs: [
              'We do not knowingly collect personal data from minors. If you are under 18, please do not submit personal information.',
              'If we learn that a minor’s data has been submitted, we will take steps to delete it promptly.'
            ]
          },
          {
            title: '12. Cross‑Border Transfers',
            paragraphs: [
              'Our services may be provided across regions, and data may be processed outside your jurisdiction.',
              'We take reasonable steps to ensure cross‑border transfers comply with applicable laws.'
            ]
          },
          {
            title: '13. Account & Data Deletion',
            paragraphs: [
              'To delete your account and associated data, please contact us using the email below.',
              'After verification, we will process the deletion request as soon as possible.'
            ]
          },
          {
            title: '14. Policy Updates',
            paragraphs: [
              'We may update this Privacy Policy from time to time. Continued use indicates acceptance of the updated policy.'
            ]
          }
        ],
        contactLabel: 'Privacy questions? Contact'
      }
);
</script>

<style scoped>
/* Reuse styles from TermsOfService or extract to common css */
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
  text-align: left;
}

.legal-header {
  margin-bottom: 60px;
  text-align: left;
}

h1 {
  font-size: 34px;
  font-weight: 900;
  color: #ccff00;
  margin-bottom: 16px;
  letter-spacing: -1px;
}

.subtitle {
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.legal-content section {
  margin-bottom: 40px;
}

h2 {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #fff;
}

p {
  line-height: 1.8;
  color: #cbd5e1;
  font-size: 13px;
}

.contact-box {
  margin-top: 60px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
  text-align: left;
}

.highlight {
  color: #ccff00;
}
</style>
