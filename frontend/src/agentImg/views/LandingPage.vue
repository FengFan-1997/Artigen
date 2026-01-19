<template>
  <div class="landing-page">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

    <div class="content-wrapper">
      <TitleBar />

      <!-- Main Content -->
      <main class="hero-section">
        <div class="hero-left">
          <div class="status-badge">
            <span class="status-dot"></span>
            {{ statusText }}
          </div>

          <h1 class="headline">
            {{ headlineLine1 }}<span class="highlight">{{ headlineHighlight1 }}</span
            ><span class="highlight">{{ headlineHighlight2 }}</span
            >{{ headlineLine2 }}
          </h1>

          <p class="description">
            {{ heroDesc }}
          </p>

          <div class="tags-row">
            <span class="hero-tag">{{ tag1 }}</span>
            <span class="hero-tag">{{ tag2 }}</span>
            <span class="hero-tag">{{ tag3 }}</span>
          </div>

          <div class="cta-row">
            <router-link
              to="/artigen/ai"
              class="hero-btn btn-primary"
              @click.prevent="onLandingNav('/artigen/ai', 'ai')"
            >
              {{ ctaWorkshop }} <span class="arrow">→</span>
            </router-link>
            <router-link
              to="/artigen/tools"
              class="hero-btn btn-secondary"
              @click.prevent="onLandingNav('/artigen/tools', 'format_factory')"
            >
              {{ ctaFormatFactory }}
            </router-link>
            <router-link
              to="/artigen/image-workshop"
              class="hero-btn btn-secondary"
              @click.prevent="onLandingNav('/artigen/image-workshop', 'image_workshop')"
            >
              {{ ctaWorkshop2 }}
            </router-link>
            <router-link
              to="/artigen/market"
              class="hero-btn btn-secondary"
              @click.prevent="onLandingNav('/artigen/market', 'market')"
            >
              {{ ctaMarket }}
            </router-link>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <div class="stat-label">{{ statLabel1 }}</div>
              <div class="stat-value">~9.5s</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">{{ statLabel2 }}</div>
              <div class="stat-value">10+</div>
            </div>
          </div>
        </div>

        <div class="hero-right">
          <div class="visual-container">
            <div class="hud-frame">
              <div class="hud-top-left">[TOOLBOX_PREVIEW]</div>
              <div class="hud-top-right">LAT: 40.22</div>
              <div class="hud-bottom-left">RENDER_ENGINE: ACTIVE</div>
              <div class="hud-bottom-right"><span class="status-dot"></span> SIGNAL_STABLE</div>

              <!-- Functional Carousel -->
              <div class="carousel-container">
                <HeroCarousel :slides="carouselSlides" @navigate="onLandingNav" />
              </div>
            </div>
          </div>
        </div>
      </main>

      <section class="features-section">
        <div class="section-header">
          <!-- <div class="sub-label">// FUNCTIONAL_MODULES</div> -->
          <h2 class="section-title">{{ featuresTitle }}</h2>
          <p class="section-desc">{{ featuresDesc }}</p>
        </div>

        <div class="features-grid">
          <router-link
            to="/artigen/ai"
            class="feature-card"
            @click.prevent="onLandingNav('/artigen/ai', 'ai')"
          >
            <div class="fc-top">
              <div class="fc-left">
                <span class="status-dot green"></span>
                <span class="fc-label">AI</span>
              </div>
              <div class="fc-right">
                <span class="module-id">UNIT-01</span>
                <span class="badge">ACTIVE</span>
              </div>
            </div>

            <div class="fc-body">
              <div class="fc-title-row">
                <h3 class="card-title">{{ feature1Title }}</h3>
                <div class="fc-icon">🎨</div>
              </div>
              <p class="card-text">
                {{ feature1Desc }}
              </p>
              <div class="card-tags"><span>TXT2IMG</span><span>IMG2IMG</span></div>
            </div>

            <div class="fc-footer">
              <span class="link-text">ENTER</span>
              <span class="action-arrow">↗</span>
            </div>
          </router-link>

          <router-link
            to="/artigen/tools"
            class="feature-card"
            @click.prevent="onLandingNav('/artigen/tools', 'format_factory')"
          >
            <div class="fc-top">
              <div class="fc-left">
                <span class="status-dot green"></span>
                <span class="fc-label">TOOLS</span>
              </div>
              <div class="fc-right">
                <span class="module-id">UNIT-02</span>
                <span class="badge">ACTIVE</span>
              </div>
            </div>

            <div class="fc-body">
              <div class="fc-title-row">
                <h3 class="card-title">{{ feature2Title }}</h3>
                <div class="fc-icon">🧰</div>
              </div>
              <p class="card-text">
                {{ feature2Desc }}
              </p>
              <div class="card-tags"><span>LOCAL</span><span>PRIVACY</span></div>
            </div>

            <div class="fc-footer">
              <span class="link-text">OPEN</span>
              <span class="action-arrow">↗</span>
            </div>
          </router-link>

          <router-link
            to="/artigen/image-workshop"
            class="feature-card"
            @click.prevent="onLandingNav('/artigen/image-workshop', 'image_workshop')"
          >
            <div class="fc-top">
              <div class="fc-left">
                <span class="status-dot green"></span>
                <span class="fc-label">LAB</span>
              </div>
              <div class="fc-right">
                <span class="module-id">UNIT-03</span>
                <span class="badge">ACTIVE</span>
              </div>
            </div>

            <div class="fc-body">
              <div class="fc-title-row">
                <h3 class="card-title">{{ feature4Title }}</h3>
                <div class="fc-icon">🛠️</div>
              </div>
              <p class="card-text">
                {{ feature4Desc }}
              </p>
              <div class="card-tags"><span>ID</span><span>RESTORE</span></div>
            </div>

            <div class="fc-footer">
              <span class="link-text">ENTER</span>
              <span class="action-arrow">↗</span>
            </div>
          </router-link>

          <router-link
            to="/artigen/market"
            class="feature-card"
            @click.prevent="onLandingNav('/artigen/market', 'market')"
          >
            <div class="fc-top">
              <div class="fc-left">
                <span class="status-dot yellow"></span>
                <span class="fc-label">MARKET</span>
              </div>
              <div class="fc-right">
                <span class="module-id">UNIT-04</span>
                <span class="badge">BETA</span>
              </div>
            </div>

            <div class="fc-body">
              <div class="fc-title-row">
                <h3 class="card-title">{{ feature3Title }}</h3>
                <div class="fc-icon">⚡</div>
              </div>
              <p class="card-text">
                {{ feature3Desc }}
              </p>
              <div class="card-tags"><span>GPU</span><span>CREDITS</span></div>
            </div>

            <div class="fc-footer">
              <span class="link-text">BROWSE</span>
              <span class="action-arrow">↗</span>
            </div>
          </router-link>
        </div>
      </section>

      <section class="info-section">
        <div class="info-container">
          <h2 class="info-title">{{ contentTitle }}</h2>
          <p class="info-desc">{{ contentDesc }}</p>

          <div class="info-grid">
            <div class="info-card">
              <h3 class="info-card-title">
                <span class="status-dot green"></span>
                {{ useCasesTitle }}
              </h3>
              <ul class="info-list">
                <li v-for="item in useCases" :key="item" class="info-list-item">
                  <span class="info-list-icon">>></span>
                  {{ item }}
                </li>
              </ul>
            </div>
            <div class="info-card">
              <h3 class="info-card-title">
                <span class="status-dot green"></span>
                {{ longTailTitle }}
              </h3>
              <div class="info-chips">
                <span v-for="k in longTailKeywords" :key="k" class="info-chip">{{ k }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="faq-section home-faq-section">
        <div class="faq-left">
          <h2 class="faq-title-large">{{ faqTitle }}</h2>
          <p class="faq-subtitle">// KNOWLEDGE_BASE</p>
        </div>
        <div class="faq-list">
          <details v-for="f in faqs" :key="f.q" class="faq-item">
            <summary class="faq-q">
              <span class="q-text">{{ f.q }}</span>
              <span class="q-icon">+</span>
            </summary>
            <div class="faq-a-wrapper">
              <div class="faq-a">{{ f.a }}</div>
            </div>
          </details>
        </div>
      </section>

      <GlobalFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import GlobalFooter from '../components/GlobalFooter.vue';
import TitleBar from '../components/TitleBar.vue';
import { useLanguageStore } from '@/stores/language';
import { useConsoleStore } from '@/stores/console';
import { trackEvent } from '@/utils/analytics';

import HeroCarousel from '../components/HeroCarousel.vue';

const router = useRouter();
const bgCanvas = ref<HTMLCanvasElement | null>(null);
let animationId: number;

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const consoleStore = useConsoleStore();

const onLandingNav = (
  path: string,
  target: 'ai' | 'format_factory' | 'market' | 'image_workshop'
) => {
  consoleStore.recordTraffic({
    type: 'conversion',
    page: '/artigen',
    target
  });
  trackEvent('landing_nav_click', { category: 'funnel', target, path });
  router.push(path);
};

const headlineLine1 = computed(() =>
  currentLang.value === 'zh' ? '对话生成您的想法' : 'Chat to generate your ideas '
);
const headlineHighlight1 = computed(() => (currentLang.value === 'zh' ? 'AI设计' : 'AI Design '));
const headlineHighlight2 = computed(() => (currentLang.value === 'zh' ? '工具箱' : 'Toolbox '));
const headlineLine2 = computed(() =>
  currentLang.value === 'zh' ? '一站式快速交付' : 'Fast delivery in one workflow'
);

const heroDesc = computed(() =>
  currentLang.value === 'zh'
    ? '用对话把脑海里的画面变成可执行的提示词与方案，直接进入 AI 设计生成；再用工具箱做压缩、转格式、PDF 处理等细节优化。创作用云端算力加速，工具默认本地处理不上传，让效率与隐私同时在线。'
    : 'Turn your idea into usable prompts through chat, then generate with AI Design. Finish with the Toolbox for conversion, compression, PDF tasks, and fine edits. Use cloud compute for creation and keep everyday tools on device for privacy.'
);

const ctaWorkshop = computed(() => (currentLang.value === 'zh' ? '开始创作' : 'Start Creating'));
const ctaWorkshop2 = computed(() =>
  currentLang.value === 'zh' ? 'AI 影像工坊' : 'Image Workshop'
);
const ctaFormatFactory = computed(() => (currentLang.value === 'zh' ? '工具箱' : 'Toolbox'));
const ctaMarket = computed(() => (currentLang.value === 'zh' ? '点数商城' : 'Compute Market'));

const statusText = computed(() =>
  currentLang.value === 'zh'
    ? 'Artigen 系统在线 · AI 设计 & 工具箱 v2.0.4'
    : 'ARTIGEN ONLINE · AI DESIGN & TOOLBOX v2.0.4'
);
const tag1 = computed(() => (currentLang.value === 'zh' ? '双模生成' : 'DUAL_MODEL'));
const tag2 = computed(() => (currentLang.value === 'zh' ? '本地工具' : 'ON_DEVICE'));
const tag3 = computed(() => (currentLang.value === 'zh' ? '隐私守护' : 'PRIVACY_GUARD'));
const statLabel1 = computed(() => (currentLang.value === 'zh' ? '响应速度' : 'Latency'));
const statLabel2 = computed(() => (currentLang.value === 'zh' ? '工具数量' : 'Tools'));

const featuresTitle = computed(() => (currentLang.value === 'zh' ? '核心功能' : 'Core Modules'));
const featuresDesc = computed(() =>
  currentLang.value === 'zh'
    ? '四大工具矩阵，覆盖图片全生命周期'
    : 'Four tool clusters covering the full image lifecycle'
);
const feature1Title = computed(() => (currentLang.value === 'zh' ? 'AI 设计' : 'AI Design'));
const feature1Desc = computed(() =>
  currentLang.value === 'zh'
    ? '搭载双模型 AI 图片生成引擎，支持文生图、图生图。内置 Prompt 优化助手，让创意精准落地。'
    : 'Dual-model image generation: text-to-image and image-to-image. Built-in prompt helper for precise creation.'
);
const feature2Title = computed(() => (currentLang.value === 'zh' ? '工具箱' : 'Toolbox'));
const feature2Desc = computed(() =>
  currentLang.value === 'zh'
    ? '把压缩、转格式、尺寸调整与 PDF 相关能力收进一个工具箱里，多数功能默认本地处理不上传。支持批量操作，省时省心。'
    : 'A toolbox for conversion, compression, resizing, and PDF workflows. Most tools run on device by default with batch support for faster turnaround.'
);
const feature3Title = computed(() => (currentLang.value === 'zh' ? '点数商城' : 'Credit Store'));
const feature3Desc = computed(() =>
  currentLang.value === 'zh'
    ? '购买点数以解锁高速 AI 生成服务。灵活套餐，满足不同创作需求。'
    : 'Purchase credits to unlock high-speed AI generation. Flexible plans for every creator.'
);
const feature4Title = computed(() =>
  currentLang.value === 'zh' ? 'AI 影像工坊' : 'Image Workshop'
);
const feature4Desc = computed(() =>
  currentLang.value === 'zh'
    ? '提供智能证件照生成、老照片修复与 FDA 配料表标签图生成。'
    : 'Smart ID photos, old photo restoration, and FDA ingredient label generation.'
);

const contentTitle = computed(() =>
  currentLang.value === 'zh' ? '你能用它做什么' : 'What you can do'
);
const contentDesc = computed(() =>
  currentLang.value === 'zh'
    ? '围绕真实工作流组织内容与长尾关键词，帮助你快速找到对应工具与最佳路径。'
    : 'Workflow-first content with long-tail queries to help you pick the right tool fast.'
);
const useCasesTitle = computed(() =>
  currentLang.value === 'zh' ? '典型场景' : 'Common scenarios'
);
const useCases = computed(() => {
  if (currentLang.value === 'zh') {
    return [
      '电商产品图：白底主图、场景图、卖点细节图',
      '营销物料：海报、封面、社媒配图与活动横幅',
      '内容创作：插画风格化、头像与素材快速生成',
      '批量处理：格式转换、压缩、尺寸调整与旋转裁切',
      '文档工作：PDF 转图片、图片转 PDF、PDF 转 Word',
      '隐私保护：本地去水印、元数据清除、安全处理',
      '算力租赁：高性能 GPU 租用、模型微调、离线渲染',
      '云端工坊：证件照生成、老照片修复、FDA 配料表'
    ];
  }
  return [
    'E-commerce visuals: hero images, scenes, detail shots',
    'Marketing assets: posters, covers, social creatives, banners',
    'Content creation: stylized illustrations, avatars, quick assets',
    'Batch processing: convert, compress, resize, rotate/crop',
    'Docs workflow: PDF to images, images to PDF, PDF to Word',
    'Privacy: Local watermark removal, metadata clearing',
    'Compute: GPU rental, fine-tuning, offline rendering',
    'Cloud Workshop: ID photos, restoration, FDA ingredient labels'
  ];
});
const longTailTitle = computed(() =>
  currentLang.value === 'zh' ? '常见搜索词' : 'Popular long-tail queries'
);
const longTailKeywords = computed(() => {
  if (currentLang.value === 'zh') {
    return [
      'heic转jpg',
      'png转jpg',
      'webp转png',
      '图片压缩不失真',
      '批量图片缩放',
      'PDF转图片',
      '图片转PDF',
      'PDF转Word',
      '图生图',
      '文生图',
      '提示词优化',
      '电商产品图生成',
      'FDA配料表生成'
    ];
  }
  return [
    'heic to jpg',
    'png to jpg',
    'webp to png',
    'image compression',
    'batch resize images',
    'pdf to images',
    'images to pdf',
    'pdf to word',
    'image-to-image',
    'text-to-image',
    'prompt optimizer',
    'product image generator',
    'FDA ingredient label'
  ];
});
const faqTitle = computed(() => (currentLang.value === 'zh' ? '常见问题' : 'FAQ'));
const faqs = computed(() => {
  if (currentLang.value === 'zh') {
    return [
      {
        q: 'Artigen 能做什么？',
        a: 'Artigen 是一个一站式影像处理平台，提供 AI 智能创作（文生图/图生图）、AI 影像工坊（证件照/老照片修复/FDA配料表）以及纯前端的图片格式转换工具（压缩/转码/PDF工具）。'
      },
      {
        q: '我的文件安全吗？会上传到服务器吗？',
        a: '隐私优先是我们设计的核心。工具（转换/压缩）所有操作均在您的浏览器本地完成，文件不会上传。AI 创作相关功能需要云端算力，我们会加密传输您的图片到模型服务，生成完成后立即销毁中间数据。'
      },
      {
        q: '生成的图片可以商用吗？',
        a: '是的。您使用 Artigen 创作的图片拥有完整的商业使用权，可用于电商主图、营销海报、自媒体配图等商业场景。'
      },
      {
        q: '点数是什么？如何获取？',
        a: '点数是使用 AI 云端算力服务的凭证。新用户注册即送免费点数。您可以通过每日签到或在「点数商城」购买套餐来获取更多点数。工具等本地功能完全免费。'
      },
      {
        q: '生成失败了会扣点数吗？',
        a: '不会。系统会自动检测生成结果，如果因网络或服务原因导致生成失败，扣除的点数会自动退回您的账户。'
      },
      {
        q: '支持手机端使用吗？',
        a: '完美支持。我们的界面已针对移动端深度适配，无论是在手机还是平板上，您都可以随时随地进行创作或处理图片。'
      }
    ];
  }
  return [
    {
      q: 'What can Artigen do?',
      a: 'Artigen is an all-in-one imaging platform offering AI creation (Text-to-Image/Image-to-Image), AI Image Workshop (ID Photos/Restoration/FDA Ingredient Labels), and client-side format tools (Conversion/Compression/PDF).'
    },
    {
      q: 'Are my files safe? Do they get uploaded?',
      a: 'Privacy is our core principle. Tools run entirely in your browser; files are never uploaded. For AI features, data is encrypted during transmission and intermediate files are deleted immediately after generation.'
    },
    {
      q: 'Can I use the images commercially?',
      a: 'Yes. You have full commercial rights to the images you generate with Artigen, suitable for e-commerce, marketing, and social media.'
    },
    {
      q: 'What are credits and how do I get them?',
      a: 'Credits are used for AI cloud services. New users get free starter credits. You can earn more by daily check-ins or purchasing packs in the "Compute Market". Local tools are free forever.'
    },
    {
      q: 'Will I be charged if generation fails?',
      a: 'No. The system automatically detects failures. If generation fails due to network or service errors, the credits are automatically refunded to your account.'
    },
    {
      q: 'Is it mobile-friendly?',
      a: 'Absolutely. Our interface is fully optimized for mobile devices, allowing you to create and process images anywhere, anytime on your phone or tablet.'
    }
  ];
});

type CarouselSlide = {
  id: 'ai' | 'format_factory' | 'market' | 'image_workshop';
  title: string;
  desc: string;
  icon: string;
  image: string;
  route: string;
};

const carouselSlides = computed<CarouselSlide[]>(() => [
  {
    id: 'ai',
    title: feature1Title.value,
    desc: feature1Desc.value,
    icon: '🎨',
    image:
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
    route: '/artigen/ai'
  },
  {
    id: 'format_factory',
    title: feature2Title.value,
    desc: feature2Desc.value,
    icon: '🔄',
    image:
      'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=800&auto=format&fit=crop',
    route: '/artigen/tools'
  },
  {
    id: 'image_workshop',
    title: feature4Title.value,
    desc: feature4Desc.value,
    icon: '🛠️',
    image:
      'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=800&auto=format&fit=crop',
    route: '/artigen/image-workshop'
  },
  {
    id: 'market',
    title: feature3Title.value,
    desc: feature3Desc.value,
    icon: '⚡',
    image:
      'https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?q=80&w=800&auto=format&fit=crop',
    route: '/artigen/market'
  }
]);

// Cyber Grid & Particles Effect
const initCyberGrid = () => {
  const canvas = bgCanvas.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = (canvas.width = window.innerWidth);
  const height = (canvas.height = window.innerHeight);

  const particles: { x: number; y: number; vx: number; vy: number; size: number }[] = [];
  const particleCount = Math.min(Math.floor((width * height) / 15000), 100);
  const connectionDistance = 150;

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 1
    });
  }

  const draw = () => {
    ctx.fillStyle = 'rgba(5, 5, 5, 0.2)'; // Fade effect
    ctx.fillRect(0, 0, width, height);

    // Draw Grid
    ctx.strokeStyle = 'rgba(204, 255, 0, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 50;

    // Moving Grid
    const time = Date.now() / 1000;
    const offsetX = (time * 10) % gridSize;
    const offsetY = (time * 10) % gridSize;

    for (let x = offsetX; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = offsetY; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Update and Draw Particles
    particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.fillStyle = 'rgba(204, 255, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Connections
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectionDistance) {
          ctx.strokeStyle = `rgba(204, 255, 0, ${0.1 * (1 - dist / connectionDistance)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    });

    animationId = requestAnimationFrame(draw);
  };

  draw();
};

const handleResize = () => {
  if (bgCanvas.value) {
    bgCanvas.value.width = window.innerWidth;
    bgCanvas.value.height = window.innerHeight;
    // Re-init or just let the loop handle it (with updated width/height in draw loop if moved inside)
    // For simplicity, we update width/height variables used in draw
  }
};

onMounted(() => {
  consoleStore.init();
  consoleStore.recordTraffic({
    type: 'page_view',
    page: '/artigen',
    meta: { referrer: document.referrer }
  });
  initCyberGrid();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', handleResize);
});
</script>

<style scoped>
@import '../styles/cyberpunk.css';

.landing-page {
  --primary: #ccff00;
  --primary-dim: rgba(204, 255, 0, 0.15);
  --primary-hover: #b3e600;
  --bg-dark: #050505;
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  --border-color: rgba(255, 255, 255, 0.1);

  position: relative;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--bg-dark);
  color: var(--text-main);
  font-family: var(--common-font);
  overflow-x: hidden;
  overflow-y: auto;
  text-align: left;
  user-select: none;
  cursor: default;
}

.landing-page input,
.landing-page textarea {
  user-select: text;
  cursor: text;
}

.bg-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  opacity: 0.4;
  pointer-events: none;
}

.content-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  background: radial-gradient(circle at 50% 50%, rgba(5, 5, 5, 0.5) 0%, rgba(5, 5, 5, 0.9) 100%);
}

/* Header */
.header {
  height: 80px;
  display: flex;
  align-items: center;
  padding: 0 40px;
  /* backdrop-filter: blur(5px); */
}

.logo-text {
  font-family: var(--common-font);
  font-weight: 700;
  font-size: 24px;
  margin-right: 80px;
  color: var(--primary);
  letter-spacing: -1px;
}

.nav-links {
  display: flex;
  gap: 40px;
}

.nav-item {
  color: var(--text-muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s;
  position: relative;
  padding: 4px 0;
}

.nav-item::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 2px;
  background-color: var(--primary);
  transition: width 0.3s ease;
  box-shadow: 0 0 8px var(--primary);
}

.nav-item:hover,
.nav-item.active {
  color: var(--text-main);
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.nav-item:hover::after,
.nav-item.active::after {
  width: 100%;
}

.header-right {
  display: flex;
  margin: 0 0 0 auto;
  gap: 24px;
  align-items: center;
}

.lang-container {
  position: relative;
  cursor: pointer;
}

.lang-switch {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  line-height: 1;
  gap: 6px;
  transition: color 0.2s;
}

.lang-switch:hover {
  color: var(--text-main);
}

.lang-switch .arrow {
  /* transition: transform 0.3s ease; */
  margin-top: -11px;
  display: inline-block;
}

.lang-switch .arrow.open {
  margin-top: 11px;
  transform: rotate(180deg);
}

.lang-dropdown {
  position: absolute;
  top: 120%;
  right: 0;
  width: 140px;
  background: rgba(10, 10, 10, 0.95);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
  padding: 8px 0;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.lang-option {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-muted);
  transition: all 0.2s;
  font-family: var(--common-font);
}

.lang-option:hover {
  background: rgba(204, 255, 0, 0.1);
  color: var(--primary);
}

.lang-option.active {
  color: var(--primary);
  font-weight: 700;
}

/* Dropdown Animation */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.2s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.login-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-main);
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
  border-color: var(--primary);
  color: var(--primary);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.15);
}

.login-btn:hover::before {
  left: 100%;
}

:deep(.login-btn.nth-login-btn) {
  border-radius: 999px;
}

/* Hero Section */
.hero-section {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 80px;
  gap: 60px;
}

.hero-left {
  flex: 1;
  max-width: 600px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--common-font);
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 24px;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: var(--primary);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--primary);
}

.headline {
  font-size: 56px;
  line-height: 1.1;
  font-weight: 900;
  margin-bottom: 24px;
  letter-spacing: -2px;
}

.headline .highlight {
  color: var(--primary); /* Fallback */
  background: linear-gradient(120deg, #fff 0%, var(--primary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.description {
  font-size: 16px;
  line-height: 1.6;
  color: var(--text-muted);
  margin-bottom: 32px;
  max-width: 480px;
}

.tags-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 40px;
}

.hero-tag {
  font-family: var(--common-font);
  font-size: 12px;
  color: var(--primary);
  background: rgba(204, 255, 0, 0.1);
  border: 1px solid rgba(204, 255, 0, 0.3);
  border-radius: 999px;
  padding: 8px 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.hero-tag:hover {
  background: rgba(204, 255, 0, 0.2);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.2);
  transform: translateY(-2px);
}

.cta-row {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 60px;
}

.hero-btn {
  text-decoration: none;
  font-family: var(--common-font);
  font-size: 14px;
  font-weight: 700;
  padding: 14px 24px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
  letter-spacing: 1px;
  position: relative;
  min-width: 140px;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
}

.btn-primary {
  background: var(--primary);
  color: #000;
  border: 1px solid var(--primary);
  box-shadow: 0 0 20px rgba(204, 255, 0, 0.2);
}

.btn-primary:hover {
  background: #b3e600;
  box-shadow: 0 0 30px rgba(204, 255, 0, 0.4);
  transform: translateY(-2px);
}

.btn-secondary {
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-secondary:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(204, 255, 0, 0.1);
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.1);
  transform: translateY(-2px);
}

.hero-btn .arrow {
  margin-left: 8px;
  transition: transform 0.3s ease;
}

.hero-btn:hover .arrow {
  transform: translateX(4px);
}

/* Button styles imported from cyberpunk.css */

.stats-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

.stat-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 16px 24px;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;
}

.stat-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  height: 100%;
  background: var(--primary);
  opacity: 0.5;
  transition: opacity 0.3s ease;
}

.stat-item:hover {
  background: rgba(204, 255, 0, 0.05);
  transform: translateY(-2px);
  border-color: rgba(204, 255, 0, 0.3);
}

.stat-item:hover::before {
  opacity: 1;
  box-shadow: 0 0 10px var(--primary);
}

.stat-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.stat-value {
  font-family: var(--common-font);
  font-size: 32px;
  font-weight: 700;
  color: var(--primary);
  text-shadow: 0 0 10px rgba(204, 255, 0, 0.3);
}

/* Hero Right Visual */
.hero-right {
  flex: 1;
  height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.visual-container {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hud-frame {
  width: 100%;
  height: 100%;
  position: relative;
  padding: 20px;
}

.hud-top-left,
.hud-top-right,
.hud-bottom-left,
.hud-bottom-right {
  position: absolute;
  font-family: var(--common-font);
  font-size: 10px;
  color: var(--primary);
  opacity: 0.7;
}

.hud-top-left {
  top: 20px;
  left: 20px;
}
.hud-top-right {
  top: 20px;
  right: 20px;
}
.hud-bottom-left {
  bottom: 20px;
  left: 20px;
}
.hud-bottom-right {
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Carousel Container */
.carousel-container {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 10;
}

/* 3D Reactor CSS Removed */

/* Responsive */
@media (max-width: 1024px) {
  .hero-section {
    flex-direction: column;
    padding: 40px;
    overflow-y: auto;
  }

  .hero-left,
  .hero-right {
    width: 100%;
    max-width: none;
  }

  .hero-right {
    /* display: none; Removed to show carousel on mobile */
    display: flex;
    height: 400px;
    margin-top: 40px;
  }

  .headline {
    font-size: 40px;
  }
}
@media (max-width: 980px) {
  .headline {
    justify-content: center !important;
    align-items: center !important;
  }
}
@media (max-width: 720px) {
  .hero-section {
    padding: 26px 16px;
    gap: 28px;
    align-items: flex-start;
  }

  .headline {
    font-size: 32px;
    letter-spacing: -1px;
  }

  .description {
    font-size: 14px;
  }

  .cta-row {
    width: 100%;
  }

  .cta-row .btn {
    width: 100%;
    justify-content: center;
  }

  .stats-row {
    gap: 22px;
    flex-wrap: wrap;
  }

  .hero-right {
    height: 320px;
  }
}

/* Features Section */
.features-section {
  padding: 100px 40px;
  background: rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 2;
}

.section-header {
  text-align: center;
  margin-bottom: 60px;
}

.sub-label {
  font-family: var(--common-font);
  color: var(--text-muted);
  font-size: 12px;
  margin-bottom: 12px;
  letter-spacing: 1px;
}

.section-title {
  font-size: 36px;
  font-weight: 900;
  margin-bottom: 16px;
  color: #fff;
}

.section-desc {
  color: var(--text-muted);
  font-size: 14px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 32px;
  max-width: 1400px;
  margin: 0 auto;
}

/* Feature card styles */
.feature-card {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(30, 30, 30, 0.4) 0%, rgba(10, 10, 10, 0.82) 100%);
  border: 1px solid var(--border-color);
  padding: 32px;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
  cursor: pointer;
  height: 100%;
  min-height: 340px;
  text-decoration: none;
  color: inherit;
}

.feature-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(800px 220px at 20% 0%, rgba(204, 255, 0, 0.14), transparent 60%);
  opacity: 0.45;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.feature-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, transparent 40%);
  opacity: 0.25;
  transform: translateY(20px);
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  pointer-events: none;
}

.feature-card > * {
  position: relative;
  z-index: 1;
}

.feature-card:hover {
  border-color: var(--primary);
  transform: translateY(-8px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
  background: linear-gradient(180deg, rgba(40, 40, 40, 0.55) 0%, rgba(15, 15, 15, 0.92) 100%);
}

.feature-card:hover::before {
  opacity: 0.75;
}

.feature-card:hover::after {
  opacity: 0.35;
  transform: translateY(0);
}

.status-dot.green {
  background: var(--primary);
  box-shadow: 0 0 8px var(--primary);
}

.status-dot.yellow {
  background: #ffd700;
  box-shadow: 0 0 8px #ffd700;
}

.fc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  font-family: var(--common-font);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.fc-left,
.fc-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fc-label {
  text-transform: uppercase;
  letter-spacing: 2px;
}

.module-id {
  opacity: 0.9;
}

.badge {
  border: 1px solid var(--border-color);
  padding: 2px 6px;
  font-size: 9px;
}

.fc-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.fc-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}

.fc-icon {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 18px;
}

.card-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 0;
  color: #fff;
}

.card-text {
  font-size: 13px;
  line-height: 1.6;
  color: #cbd5e1;
  margin-bottom: 24px;
  flex: 1;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.card-tags span {
  font-size: 10px;
  color: var(--primary);
  background: rgba(204, 255, 0, 0.1);
  padding: 4px 8px;
  font-family: var(--common-font);
}

.fc-footer {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--common-font);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
}

.link-text {
  color: #fff;
  letter-spacing: 1px;
}

.action-arrow {
  color: var(--primary);
  font-size: 16px;
  text-decoration: none;
  transition: transform 0.2s;
}

.feature-card:hover .action-arrow {
  transform: translateX(5px);
}

@media (max-width: 1200px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
    max-width: 980px;
  }
}

@media (max-width: 980px) {
  .features-grid {
    grid-template-columns: 1fr;
    max-width: 800px;
  }
}

.home-faq-section {
  width: 60vw;
  margin-left: auto;
  margin-right: auto;
}
</style>
