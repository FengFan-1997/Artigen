<template>
  <div class="seo-landing-page">
    <TitleBar />

    <div class="landing-hero">
      <div class="hero-content">
        <div class="hero-badge">
          <span class="dot"></span>
          <span class="text">{{ ui.heroBadge }}</span>
        </div>
        <h1 class="hero-title">
          {{ ui.heroTitle1 }} <span class="highlight">{{ ui.heroTitle2 }}</span>
        </h1>
        <p class="hero-subtitle">{{ ui.heroSubtitle }}</p>
        <div class="hero-actions">
          <button class="action-btn primary" @click="goFormatFactory">
            <span class="icon">⚡</span> {{ ui.btnFormat }}
          </button>
          <button class="action-btn secondary" @click="goAiWorkshop">
            <span class="icon">🎨</span> {{ ui.btnAi }}
          </button>
        </div>
        <div class="hero-trust">
          <span class="trust-item">🔒 {{ ui.trustPrivacy }}</span>
          <span class="trust-item">🚀 {{ ui.trustSpeed }}</span>
          <span class="trust-item">🆓 {{ ui.trustFree }}</span>
        </div>
      </div>
    </div>

    <div class="features-section">
      <div class="section-header">
        <h2>{{ ui.featuresTitle }}</h2>
        <p>{{ ui.featuresDesc }}</p>
      </div>
      <div class="features-grid">
        <div class="feature-card" @click="goFormatFactory">
          <div class="card-icon">🔄</div>
          <h3>{{ ui.featFormatTitle }}</h3>
          <p>{{ ui.featFormatDesc }}</p>
          <div class="card-link">{{ ui.tryNow }} →</div>
        </div>
        <div class="feature-card" @click="goAiWorkshop">
          <div class="card-icon">✨</div>
          <h3>{{ ui.featAiTitle }}</h3>
          <p>{{ ui.featAiDesc }}</p>
          <div class="card-link">{{ ui.tryNow }} →</div>
        </div>
        <div class="feature-card" @click="goMarket">
          <div class="card-icon">🔋</div>
          <h3>{{ ui.featMarketTitle }}</h3>
          <p>{{ ui.featMarketDesc }}</p>
          <div class="card-link">{{ ui.viewPlans }} →</div>
        </div>
      </div>
    </div>

    <!-- Info Section (SEO) -->
    <div class="info-section">
      <div class="info-container">
        <h2 class="info-title">{{ ui.seoTitle }}</h2>
        <p class="info-desc">{{ ui.seoDesc }}</p>

        <div class="info-grid">
          <div class="info-card">
            <div class="info-card-title">> {{ ui.whyUsTitle }}</div>
            <ul class="info-list">
              <li v-for="(item, idx) in ui.whyUsList" :key="idx" class="info-list-item">
                <span class="info-list-icon">✓</span>
                {{ item }}
              </li>
            </ul>
          </div>

          <div class="info-card">
            <div class="info-card-title">> {{ ui.hotToolsTitle }}</div>
            <div class="info-chips">
              <span
                v-for="(chip, idx) in ui.hotToolsList"
                :key="idx"
                class="info-chip"
                @click="handleChipClick(chip)"
              >
                {{ chip }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- FAQ Section -->
    <div class="faq-section">
      <div class="faq-left">
        <div class="faq-title-large">{{ ui.faqTitle }}</div>
        <div class="faq-subtitle">{{ ui.faqSubtitle }}</div>
      </div>
      <div class="faq-list">
        <details v-for="f in ui.faqs" :key="f.q" class="faq-item">
          <summary class="faq-q">
            <span class="q-text">{{ f.q }}</span>
            <span class="q-icon">+</span>
          </summary>
          <div class="faq-a-wrapper">
            <div class="faq-a">{{ f.a }}</div>
          </div>
        </details>
      </div>
    </div>

    <div class="seo-footer-banner">
      <h2>{{ ui.ctaTitle }}</h2>
      <p>{{ ui.ctaDesc }}</p>
      <button class="cta-btn" @click="goFormatFactory">{{ ui.ctaBtn }}</button>
    </div>

    <GlobalFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import TitleBar from '../components/TitleBar.vue';
import GlobalFooter from '../components/GlobalFooter.vue';
import { useLanguageStore } from '@/stores/language';
import { useConsoleStore } from '@/stores/console';
import { trackPageView, trackEvent } from '@/utils/analytics';

const router = useRouter();
const languageStore = useLanguageStore();
const consoleStore = useConsoleStore();
const { currentLang } = storeToRefs(languageStore);

onMounted(() => {
  consoleStore.init();
  trackPageView({
    path: '/artigen/tools',
    title: document.title,
    location: window.location.href
  });
  // Record page view in Console Store (for internal dashboard)
  consoleStore.recordTraffic({
    type: 'page_view',
    page: '/artigen/tools',
    meta: { referrer: document.referrer }
  });
});

const trackAndNavigate = (target: string, type: 'click' | 'conversion', name: string) => {
  consoleStore.recordTraffic({
    type,
    page: '/artigen/tools',
    target: name
  });
  trackEvent(type === 'conversion' ? 'tools_conversion' : 'tools_click', { target: name });
  router.push(target);
};

const goFormatFactory = () =>
  trackAndNavigate('/artigen/format-factory', 'conversion', 'format_factory');
const goAiWorkshop = () => trackAndNavigate('/artigen/ai', 'conversion', 'ai_workshop');
const goMarket = () => trackAndNavigate('/artigen/market', 'click', 'market');

const handleChipClick = (chip: string) => {
  consoleStore.recordTraffic({
    type: 'click',
    page: '/artigen/tools',
    target: `chip_${chip}`
  });
  trackEvent('tools_chip_click', { keyword: chip });

  // Simple navigation logic based on keywords
  if (
    chip.includes('AI') ||
    chip.includes('图') ||
    chip.includes('Art') ||
    chip.includes('Text') ||
    chip.includes('Photo')
  ) {
    router.push('/artigen/ai');
  } else {
    router.push('/artigen/format-factory');
  }
};

const ui = computed(() => {
  const isZh = currentLang.value === 'zh';
  return isZh
    ? {
        heroBadge: '一站式在线工具集',
        heroTitle1: '释放您的',
        heroTitle2: '创造力与效率',
        heroSubtitle:
          'Artigen 提供强大的 AI 图像生成、无损格式转换与本地化隐私保护工具。无需下载，打开即用。',
        btnFormat: '格式工厂',
        btnAi: 'AI 创作工坊',
        trustPrivacy: '隐私安全',
        trustSpeed: '极速处理',
        trustFree: '免费使用',

        featuresTitle: '为什么选择 Artigen？',
        featuresDesc: '我们将前沿的 AI 技术与便捷的工具相结合，为您提供极致的在线体验。',

        featFormatTitle: '全能格式工厂',
        featFormatDesc:
          '支持 HEIC, PDF, WEBP, PNG 等多种格式互转。纯前端处理，文件不上传服务器，绝对安全。',
        featAiTitle: 'AI 灵感工坊',
        featAiDesc: '文生图、图生图、提示词优化。激发无限创意，生成高质量的电商素材与艺术作品。',
        featMarketTitle: '算力加速',
        featMarketDesc: '按需购买高性能算力，解锁更快的生成速度与更高分辨率的画质。',
        tryNow: '立即体验',
        viewPlans: '查看方案',

        seoTitle: '高效、安全、免费的在线工具平台',
        seoDesc:
          'Artigen 致力于打造最受用户信赖的在线工具箱。无论您是设计师、开发者还是办公人员，这里都有您需要的工具。',
        whyUsTitle: '核心优势',
        whyUsList: [
          '隐私优先：格式转换等工具完全在浏览器本地运行',
          '无需安装：打开网页即可使用，跨平台兼容',
          'AI 赋能：集成最新人工智能模型，提升创作效率',
          '持续更新：每周推出新功能与工具优化',
          '免费友好：基础功能永久免费，无隐形收费'
        ],
        hotToolsTitle: '热门工具直达',
        hotToolsList: [
          'HEIC转JPG',
          'PDF转图片',
          '图片压缩',
          'AI绘画',
          '文生图',
          '电商主图生成',
          'WEBP转换',
          'PNG转ICO',
          '视频截帧',
          'GIF制作',
          '在线修图',
          '提示词助手'
        ],

        faqTitle: '常见问题',
        faqSubtitle: '了解更多关于 Artigen 的信息',
        faqs: [
          {
            q: 'Artigen 是免费的吗？',
            a: '大部分工具（如格式工厂）完全免费。AI 生成功能提供免费额度，高级算力需消耗点数。'
          },
          {
            q: '我的文件安全吗？',
            a: '绝对安全。格式工厂工具采用纯前端技术，文件从未离开您的设备。'
          },
          {
            q: '如何开始使用 AI 绘图？',
            a: '点击“AI 创作工坊”，输入您的创意描述（提示词），即可生成精美图片。'
          },
          {
            q: '支持移动端使用吗？',
            a: '支持。我们的页面经过响应式设计，在手机和平板上也能流畅使用。'
          }
        ],

        ctaTitle: '准备好提升效率了吗？',
        ctaDesc: '加入数万名创作者的行列，体验 Artigen 带来的便捷与强大。',
        ctaBtn: '开始使用'
      }
    : {
        heroBadge: 'All-in-One Online Toolkit',
        heroTitle1: 'Unleash Your',
        heroTitle2: 'Creativity & Efficiency',
        heroSubtitle:
          'Artigen provides powerful AI image generation, lossless format conversion, and privacy-first tools. No download required.',
        btnFormat: 'Format Factory',
        btnAi: 'AI Workshop',
        trustPrivacy: 'Privacy First',
        trustSpeed: 'Blazing Fast',
        trustFree: 'Free to Use',

        featuresTitle: 'Why Choose Artigen?',
        featuresDesc:
          'Combining cutting-edge AI with convenient tools for the ultimate online experience.',

        featFormatTitle: 'Universal Format Factory',
        featFormatDesc:
          'Convert HEIC, PDF, WEBP, PNG, and more. Client-side processing ensures your files never leave your device.',
        featAiTitle: 'AI Art Workshop',
        featAiDesc:
          'Text-to-Image, Image-to-Image, Prompt Optimization. Generate high-quality assets and art instantly.',
        featMarketTitle: 'Compute Power',
        featMarketDesc:
          'On-demand high-performance compute for faster generation and higher resolution.',
        tryNow: 'Try Now',
        viewPlans: 'View Plans',

        seoTitle: 'Efficient, Secure, Free Online Tools',
        seoDesc:
          'Artigen is your trusted online toolbox for designers, developers, and office workers.',
        whyUsTitle: 'Core Benefits',
        whyUsList: [
          'Privacy: Local processing for file tools',
          'No Install: Works in any modern browser',
          'AI Powered: Latest models for creativity',
          'Weekly Updates: New tools and features',
          'Free Friendly: Basic tools are always free'
        ],
        hotToolsTitle: 'Popular Tools',
        hotToolsList: [
          'HEIC to JPG',
          'PDF to Image',
          'Image Compressor',
          'AI Art',
          'Text to Image',
          'Product Photography',
          'WEBP Converter',
          'PNG to ICO',
          'Video Frame',
          'GIF Maker',
          'Photo Editor',
          'Prompt Helper'
        ],

        faqTitle: 'FAQ',
        faqSubtitle: 'Learn more about Artigen',
        faqs: [
          {
            q: 'Is Artigen free?',
            a: 'Most tools (like Format Factory) are free. AI tools offer free credits, with premium compute available.'
          },
          {
            q: 'Are my files safe?',
            a: 'Yes. Format Factory tools run locally in your browser. Files are not uploaded.'
          },
          {
            q: 'How to start AI art?',
            a: 'Go to AI Workshop, enter your prompt, and generate amazing images.'
          },
          { q: 'Mobile friendly?', a: 'Yes, fully responsive design for phones and tablets.' }
        ],

        ctaTitle: 'Ready to Boost Productivity?',
        ctaDesc: 'Join thousands of creators using Artigen today.',
        ctaBtn: 'Get Started'
      };
});
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.seo-landing-page {
  min-height: 100vh;
  background: #050505;
  color: #fff;
  font-family: 'Inter', sans-serif;
  padding-top: 60px; /* TitleBar space */
}

/* Hero Section */
.landing-hero {
  padding: 80px 20px;
  text-align: center;
  background: radial-gradient(circle at 50% 30%, rgba(124, 58, 237, 0.15) 0%, transparent 70%);
}

.hero-content {
  max-width: 800px;
  margin: 0 auto;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  padding: 6px 16px;
  border-radius: 20px;
  margin-bottom: 24px;
}

.hero-badge .dot {
  width: 8px;
  height: 8px;
  background: #8b5cf6;
  border-radius: 50%;
  box-shadow: 0 0 8px #8b5cf6;
}

.hero-badge .text {
  color: #c4b5fd;
  font-size: 14px;
  font-weight: 500;
}

.hero-title {
  font-size: 48px;
  line-height: 1.2;
  font-weight: 800;
  margin-bottom: 24px;
  letter-spacing: -1px;
}

.hero-title .highlight {
  background: linear-gradient(135deg, #a78bfa 0%, #3b82f6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 18px;
  color: #94a3b8;
  line-height: 1.6;
  margin-bottom: 40px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.hero-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 40px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 32px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.action-btn.primary {
  background: #7c3aed;
  color: white;
  border: none;
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4);
}

.action-btn.primary:hover {
  background: #6d28d9;
  transform: translateY(-2px);
}

.action-btn.secondary {
  background: rgba(255, 255, 255, 0.05);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.action-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.hero-trust {
  display: flex;
  justify-content: center;
  gap: 24px;
  color: #64748b;
  font-size: 14px;
}

/* Features Section */
.features-section {
  padding: 60px 20px;
  background: #0a0a0a;
}

.section-header {
  text-align: center;
  margin-bottom: 50px;
}

.section-header h2 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 12px;
}

.section-header p {
  color: #94a3b8;
  max-width: 500px;
  margin: 0 auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 32px;
  transition: all 0.3s ease;
  cursor: pointer;
}

.feature-card:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-5px);
  border-color: rgba(139, 92, 246, 0.3);
}

.card-icon {
  font-size: 32px;
  margin-bottom: 20px;
}

.feature-card h3 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #f8fafc;
}

.feature-card p {
  color: #94a3b8;
  line-height: 1.6;
  margin-bottom: 20px;
}

.card-link {
  color: #a78bfa;
  font-weight: 500;
  font-size: 14px;
}

/* SEO Footer Banner */
.seo-footer-banner {
  text-align: center;
  padding: 80px 20px;
  background: linear-gradient(180deg, rgba(124, 58, 237, 0.05) 0%, transparent 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.seo-footer-banner h2 {
  font-size: 36px;
  font-weight: 800;
  margin-bottom: 16px;
}

.seo-footer-banner p {
  color: #94a3b8;
  margin-bottom: 32px;
  font-size: 18px;
}

.cta-btn {
  background: white;
  color: black;
  border: none;
  padding: 16px 40px;
  border-radius: 30px;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s;
}

.cta-btn:hover {
  transform: scale(1.05);
}

@media (max-width: 768px) {
  .hero-title {
    font-size: 36px;
  }
  .hero-actions {
    flex-direction: column;
  }
  .hero-trust {
    flex-wrap: wrap;
    gap: 16px;
  }
}
</style>
