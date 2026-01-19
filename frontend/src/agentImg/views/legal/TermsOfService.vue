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
        title: '服务条款',
        updatedAt: '最后更新: 2026-01-19',
        sections: [
          {
            title: '1. 接受条款',
            paragraphs: [
              '欢迎使用 Artigen。访问或使用本平台即表示您已阅读、理解并同意本《使用条款》。',
              '如您不同意本条款，请停止访问或使用本服务。'
            ]
          },
          {
            title: '2. 账号与资格',
            paragraphs: [
              '您需具备相应的民事行为能力方可使用本服务，并保证所提交信息真实、准确、完整。',
              '您应妥善保管账号与登录凭证，并对账号下的所有活动负责。'
            ]
          },
          {
            title: '3. 服务范围与可用性',
            paragraphs: [
              'Artigen 提供 AI 影像创作与相关工具服务，功能范围可能随版本迭代而调整。',
              '我们可能因维护、升级或不可抗力导致服务中断或延迟。'
            ]
          },
          {
            title: '4. 内容与授权',
            paragraphs: [
              '您上传或输入的内容应拥有合法权利或已获得充分授权。',
              '为提供服务所需，您授予我们在服务范围内处理、存储与传输相关内容的必要权限。',
              '除非另有说明，您生成的结果在法律允许范围内归您或相关权利人所有。'
            ]
          },
          {
            title: '5. 禁止用途',
            paragraphs: [
              '您不得使用本平台从事违法、侵权、欺诈、骚扰、仇恨、色情、暴力或其他有害行为。',
              '您不得尝试绕过安全机制或干扰服务的正常运行。',
              '我们有权对疑似违规内容采取限制访问、拒绝处理、记录必要日志等措施。'
            ]
          },
          {
            title: '6. AI 输出与使用风险',
            paragraphs: [
              'AI 输出可能存在不准确、遗漏或与他人内容相似的情况，您应自行判断并承担使用风险。',
              '如涉及商业用途，建议您进行必要的合规与权利审查。'
            ]
          },
          {
            title: '7. 费用、点数与退款',
            paragraphs: [
              '部分功能可能需要付费或消耗点数，具体以页面提示或订单说明为准。',
              '除非另有说明，已支付费用与已消耗点数不予退还。',
              '相关税费由您按适用法律承担。'
            ]
          },
          {
            title: '8. 第三方服务与链接',
            paragraphs: [
              '部分能力可能由第三方服务提供，我们将尽量选择可信赖的服务商。',
              '第三方网站或服务的内容与行为不受我们控制，您需自行判断与承担风险。'
            ]
          },
          {
            title: '9. 数据安全与隐私',
            paragraphs: [
              '我们将采取合理的管理、物理与技术措施保护数据安全。',
              '有关个人信息处理的详情，请参阅我们的《隐私政策》。'
            ]
          },
          {
            title: '10. 终止与账号停用',
            paragraphs: [
              '如您违反本条款或存在风险行为，我们可能暂停或终止您的访问权限。',
              '您也可随时停止使用服务，必要时联系我们处理账号相关请求。'
            ]
          },
          {
            title: '11. 责任限制',
            paragraphs: [
              '本服务按“现状”提供。我们不对间接损失、利润损失或数据丢失承担责任。',
              '在法律允许的范围内，我们的责任总额不超过您在相关服务中已支付的费用。'
            ]
          },
          {
            title: '12. 条款更新',
            paragraphs: ['我们可能不时更新本条款。更新后继续使用服务即视为同意更新后的条款。']
          }
        ],
        contactLabel: '如有疑问，请联系'
      }
    : {
        navFormatFactory: 'Tools',
        navAiWorkshop: 'AI Design',
        navMarket: 'Compute Market',
        portfolio: 'PORTFOLIO',
        title: 'Terms of Service',
        updatedAt: 'Last updated: 2026-01-19',
        sections: [
          {
            title: '1. Acceptance of Terms',
            paragraphs: [
              'Welcome to Artigen. By accessing or using the service, you agree to these Terms of Use.',
              'If you do not agree, please stop using the service.'
            ]
          },
          {
            title: '2. Accounts & Eligibility',
            paragraphs: [
              'You must have the legal capacity to use the service and provide accurate, complete information.',
              'You are responsible for all activity under your account and for safeguarding your credentials.'
            ]
          },
          {
            title: '3. Scope & Availability',
            paragraphs: [
              'Artigen provides AI image creation and related tools. Features may change over time.',
              'We may suspend or limit access for maintenance, upgrades, or events beyond our control.'
            ]
          },
          {
            title: '4. Content & Licenses',
            paragraphs: [
              'You must own or have sufficient rights to any content you upload or submit.',
              'You grant us the rights necessary to process, store, and transmit content to provide the service.',
              'Unless otherwise stated, generated results remain yours or the applicable rights holder’s.'
            ]
          },
          {
            title: '5. Prohibited Use',
            paragraphs: [
              'You may not use the service for unlawful, infringing, fraudulent, abusive, hateful, sexual, violent, or otherwise harmful activities.',
              'You may not attempt to bypass security controls or disrupt the service.',
              'We may restrict access to content or users that violate these provisions.'
            ]
          },
          {
            title: '6. AI Output & Risk',
            paragraphs: [
              'AI outputs may be inaccurate, incomplete, or similar to other content. You assume all risks from use.',
              'For commercial use, you should perform necessary compliance and rights checks.'
            ]
          },
          {
            title: '7. Fees, Credits & Refunds',
            paragraphs: [
              'Some features require payment or credits. Details are shown on the relevant pages or orders.',
              'Unless otherwise specified, fees and consumed credits are non-refundable.',
              'You are responsible for any applicable taxes or duties.'
            ]
          },
          {
            title: '8. Third‑Party Services & Links',
            paragraphs: [
              'Certain capabilities may rely on third‑party providers that we select in good faith.',
              'We are not responsible for third‑party sites or services, and your use is at your own risk.'
            ]
          },
          {
            title: '9. Data Security & Privacy',
            paragraphs: [
              'We use reasonable administrative, physical, and technical measures to protect data.',
              'For details on personal data processing, please review our Privacy Policy.'
            ]
          },
          {
            title: '10. Termination',
            paragraphs: [
              'We may suspend or terminate access if you violate these terms or pose risk to the service.',
              'You may stop using the service at any time and contact us for account‑related requests.'
            ]
          },
          {
            title: '11. Limitation of Liability',
            paragraphs: [
              'The service is provided “as is”. We are not liable for indirect, incidental, or consequential damages.',
              'To the maximum extent permitted by law, our total liability will not exceed the fees you paid for the relevant service.'
            ]
          },
          {
            title: '12. Updates to These Terms',
            paragraphs: [
              'We may update these terms from time to time. Continued use indicates acceptance of the updated terms.'
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
  font-family: var(--common-font);
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
  font-family: var(--common-font);
  font-size: 12px;
  font-weight: 500;
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
  font-weight: 500;
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
  font-weight: 500;
}

.legal-content section {
  margin-bottom: 40px;
}

h2 {
  font-size: 17px;
  font-weight: 800;
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
  font-family: var(--common-font);
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
  text-align: left;
}

.highlight {
  color: #ccff00;
}
</style>
