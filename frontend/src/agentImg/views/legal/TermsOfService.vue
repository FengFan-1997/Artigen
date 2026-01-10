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
        navFormatFactory: '格式工厂',
        navAiWorkshop: 'AI工坊',
        navMarket: '算力商城',
        portfolio: '作品集',
        title: '服务条款',
        updatedAt: '最后更新: 2025-12-30',
        sections: [
          {
            title: '1. 服务说明',
            paragraphs: [
              '「Artigen」（由个人开发者独立运营）是一款基于人工智能的图像生成服务。您上传照片后，我们的AI系统会根据预设的风格模板为您生成艺术化的头像图片。'
            ]
          },
          {
            title: '2. 使用规范',
            paragraphs: [
              '您在使用本服务时，需确保上传的照片为您本人或已获得授权。禁止上传违法、侵权或不当内容。我们保留拒绝处理任何我们认为不适当内容的权利。'
            ]
          },
          {
            title: '3. 付费与退款',
            paragraphs: [
              '本服务采用积分制，购买的积分永久有效。如需退款，请在购买后 3 天内提出申请，且已使用积分不超过 20 个。超出此条件的订单不支持退款。详情请参阅我们的退款政策页面。'
            ]
          },
          {
            title: '4. 隐私保护',
            paragraphs: [
              '我们重视您的隐私。本服务不存储您上传的照片，图片直接传输至处理引擎。处理完成后即时返回结果。我们的服务器不保留任何图片数据。'
            ]
          },
          {
            title: '5. 知识产权',
            paragraphs: [
              '生成的图片归您所有，您可以自由使用。但本服务的技术、界面设计、风格模板等知识产权归「Artigen」所有。'
            ]
          },
          {
            title: '6. 免责声明',
            paragraphs: [
              '本服务按“现状”提供。我们要不对AI生成结果的准确性、适用性做任何保证。因使用本服务产生的任何直接或间接损失，我们不承担责任。'
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
        title: 'Terms of Service',
        updatedAt: 'Last updated: 2025-12-30',
        sections: [
          {
            title: '1. Service Description',
            paragraphs: [
              'Artigen (operated independently by an individual developer) is an AI-based image generation service. After you upload a photo, our AI system generates a stylized avatar based on preset style templates.'
            ]
          },
          {
            title: '2. Acceptable Use',
            paragraphs: [
              'When using this service, you must ensure the uploaded photo is of yourself or you have obtained proper authorization. Illegal, infringing, or inappropriate content is prohibited. We reserve the right to refuse processing any content we deem inappropriate.'
            ]
          },
          {
            title: '3. Payments & Refunds',
            paragraphs: [
              'This service uses a points system. Purchased points do not expire. Refund requests must be submitted within 3 days of purchase, and no more than 20 points may have been used. Orders that do not meet these conditions are not eligible for refunds. Please refer to our Refund Policy for details.'
            ]
          },
          {
            title: '4. Privacy',
            paragraphs: [
              'We value your privacy. This service does not store the photos you upload. Images are transmitted directly to the processing engine, and results are returned immediately after processing. Our servers do not retain any image data.'
            ]
          },
          {
            title: '5. Intellectual Property',
            paragraphs: [
              'You own the generated images and may use them freely. However, the service’s technology, interface design, and style templates are the intellectual property of Artigen.'
            ]
          },
          {
            title: '6. Disclaimer',
            paragraphs: [
              'This service is provided “as is”. We make no warranties regarding the accuracy or suitability of AI-generated results. We are not liable for any direct or indirect losses arising from the use of this service.'
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
