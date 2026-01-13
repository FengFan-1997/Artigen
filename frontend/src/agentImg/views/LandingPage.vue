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
            ><br />
            <span class="highlight">{{ headlineHighlight2 }}</span
            >{{ headlineLine2 }}
          </h1>

          <p class="description">
            {{ heroDesc }}
          </p>

          <div class="tags-row">
            <span class="tag">{{ tag1 }}</span>
            <span class="tag">{{ tag2 }}</span>
            <span class="tag">{{ tag3 }}</span>
          </div>

          <div class="cta-row">
            <router-link
              to="/artigen/ai"
              class="btn primary-btn"
              @click.prevent="onLandingNav('/artigen/ai', 'ai')"
            >
              {{ ctaWorkshop }} <span class="arrow">→</span>
            </router-link>
            <router-link
              to="/artigen/format-factory"
              class="btn outline-btn"
              @click.prevent="onLandingNav('/artigen/format-factory', 'format_factory')"
            >
              {{ ctaFormatFactory }}
            </router-link>
            <router-link
              to="/artigen/market"
              class="btn outline-btn"
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

              <!-- 3D Reactor Representation -->
              <div class="reactor-wrapper">
                <div class="reactor-container">
                  <div class="reactor-ring ring-outer"></div>
                  <div class="reactor-ring ring-middle"></div>
                  <div class="reactor-ring ring-inner"></div>
                  <div class="reactor-ring ring-detail"></div>
                  <div class="reactor-core-glow"></div>
                </div>
                <div class="floating-data">
                  <span class="bit bit-1">0</span>
                  <span class="bit bit-2">1</span>
                  <span class="bit bit-3">1</span>
                  <span class="bit bit-4">0</span>
                  <span class="bit bit-5">1</span>
                  <span class="bit bit-6">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <section class="features-section">
        <div class="section-header">
          <div class="sub-label">// FUNCTIONAL_MODULES</div>
          <h2 class="section-title">{{ featuresTitle }}</h2>
          <p class="section-desc">{{ featuresDesc }}</p>
        </div>

        <div class="features-grid">
          <div class="feature-card" @click="onLandingNav('/artigen/ai', 'ai')">
            <div class="card-header">
              <span class="status-dot green"></span>
              <span class="module-id">MODULE_01</span>
              <span class="badge">ACTIVE</span>
            </div>
            <h3 class="card-title">{{ feature1Title }}</h3>
            <div class="card-subtitle">AI-POWERED CREATION</div>
            <p class="card-text">
              {{ feature1Desc }}
            </p>
            <div class="card-tags"><span>TXT2IMG</span><span>IMG2IMG</span></div>
            <div class="card-action">
              <span class="link-text">ENTER WORKSHOP</span>
              <span class="action-arrow">→</span>
            </div>
          </div>

          <div
            class="feature-card"
            @click="onLandingNav('/artigen/format-factory', 'format_factory')"
          >
            <div class="card-header">
              <span class="status-dot green"></span>
              <span class="module-id">MODULE_02</span>
              <span class="badge">ACTIVE</span>
            </div>
            <h3 class="card-title">{{ feature2Title }}</h3>
            <div class="card-subtitle">FORMAT CONVERTER</div>
            <p class="card-text">
              {{ feature2Desc }}
            </p>
            <div class="card-tags"><span>LOCAL_PROCESS</span><span>PRIVACY</span></div>
            <div class="card-action">
              <span class="link-text">OPEN TOOLS</span>
              <span class="action-arrow">→</span>
            </div>
          </div>

          <div class="feature-card" @click="onLandingNav('/artigen/market', 'market')">
            <div class="card-header">
              <span class="status-dot yellow"></span>
              <span class="module-id">MODULE_03</span>
              <span class="badge">BETA</span>
            </div>
            <h3 class="card-title">{{ feature3Title }}</h3>
            <div class="card-subtitle">COMPUTE MARKET</div>
            <p class="card-text">
              {{ feature3Desc }}
            </p>
            <div class="card-tags"><span>GPU_RENTAL</span><span>DISTRIBUTED</span></div>
            <div class="card-action">
              <span class="link-text">BROWSE MARKET</span>
              <span class="action-arrow">→</span>
            </div>
          </div>
        </div>
      </section>

      <section class="content-section">
        <div class="content-inner">
          <div class="section-header">
            <div class="sub-label">// CONTENT_GUIDE</div>
            <h2 class="section-title">{{ contentTitle }}</h2>
            <p class="section-desc">{{ contentDesc }}</p>
          </div>

          <div class="content-grid">
            <div class="content-card">
              <h3 class="content-card-title">{{ useCasesTitle }}</h3>
              <ul class="content-list">
                <li v-for="item in useCases" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div class="content-card">
              <h3 class="content-card-title">{{ longTailTitle }}</h3>
              <div class="chips">
                <span v-for="k in longTailKeywords" :key="k" class="chip">{{ k }}</span>
              </div>
            </div>
          </div>

          <div class="faq">
            <h3 class="content-card-title">{{ faqTitle }}</h3>
            <details v-for="f in faqs" :key="f.q" class="faq-item">
              <summary class="faq-q">{{ f.q }}</summary>
              <div class="faq-a">{{ f.a }}</div>
            </details>
          </div>
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
import { trackEvent } from '@/utils/analytics';

const router = useRouter();
const bgCanvas = ref<HTMLCanvasElement | null>(null);
let animationId: number;

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const onLandingNav = (path: string, target: 'ai' | 'format_factory' | 'market') => {
  trackEvent('landing_nav_click', { category: 'funnel', target, path });
  router.push(path);
};

const headlineLine1 = computed(() =>
  currentLang.value === 'zh' ? '聚合 N 种' : 'Aggregate N kinds of '
);
const headlineHighlight1 = computed(() => (currentLang.value === 'zh' ? '黑科技' : 'Tech Magic'));
const headlineHighlight2 = computed(() =>
  currentLang.value === 'zh' ? '搞定图片' : 'Solve Images'
);
const headlineLine2 = computed(() =>
  currentLang.value === 'zh' ? '一切需求' : ' for every use case'
);

const heroDesc = computed(() =>
  currentLang.value === 'zh'
    ? '从 AI 智能创作到格式批量转换，打造一站式影像处理解决方案。深度集成 AI 算力引擎与高性能传统算法，10+ 专业工具覆盖图片全生命周期。支持双模型 AI 生成、多种格式转换，纯前端处理确保数据隐私安全。'
    : 'From AI creation to batch format conversion, a one-stop imaging toolkit. Deeply integrated AI compute and high-performance classic algorithms, with 10+ professional tools covering the full image lifecycle. Dual-model AI generation, multi-format conversion, and client-side processing for privacy.'
);

const ctaWorkshop = computed(() => (currentLang.value === 'zh' ? 'AI 工坊' : 'AI Workshop'));
const ctaFormatFactory = computed(() =>
  currentLang.value === 'zh' ? '格式工厂' : 'Format Factory'
);
const ctaMarket = computed(() => (currentLang.value === 'zh' ? '算力商城' : 'Compute Market'));

const statusText = computed(() =>
  currentLang.value === 'zh' ? '工具库在线 SYS v2.0.4' : 'TOOLBOX ONLINE SYS v2.0.4'
);
const tag1 = computed(() => (currentLang.value === 'zh' ? 'AI 驱动' : 'AI_POWERED'));
const tag2 = computed(() => (currentLang.value === 'zh' ? '前端处理' : 'CLIENT_SIDE'));
const tag3 = computed(() => (currentLang.value === 'zh' ? '隐私优先' : 'PRIVACY_FIRST'));
const statLabel1 = computed(() => (currentLang.value === 'zh' ? '响应速度' : 'Latency'));
const statLabel2 = computed(() => (currentLang.value === 'zh' ? '工具数量' : 'Tools'));

const featuresTitle = computed(() => (currentLang.value === 'zh' ? '核心功能' : 'Core Modules'));
const featuresDesc = computed(() =>
  currentLang.value === 'zh'
    ? '三大工具矩阵，覆盖图片全生命周期'
    : 'Three tool clusters covering the full image lifecycle'
);
const feature1Title = computed(() => (currentLang.value === 'zh' ? 'AI 工坊' : 'AI Workshop'));
const feature1Desc = computed(() =>
  currentLang.value === 'zh'
    ? '搭载双模型 AI 图片生成引擎，支持文生图、图生图。内置 Prompt 优化助手，让创意精准落地。'
    : 'Dual-model image generation: text-to-image and image-to-image. Built-in prompt helper for precise creation.'
);
const feature2Title = computed(() => (currentLang.value === 'zh' ? '格式工厂' : 'Format Factory'));
const feature2Desc = computed(() =>
  currentLang.value === 'zh'
    ? 'WebP/JPEG/PNG 全格式支持，纯前端处理保障隐私。支持批量压缩、去水印、PDF 转换等 10+ 实用工具。'
    : 'Full format support (WebP/JPEG/PNG) with client-side processing for privacy. 10+ utilities like batch compress, watermark removal, and PDF conversion.'
);
const feature3Title = computed(() => (currentLang.value === 'zh' ? '算力商城' : 'Compute Market'));
const feature3Desc = computed(() =>
  currentLang.value === 'zh'
    ? '分布式算力租赁平台，按需购买 GPU 资源。支持模型微调、批量渲染任务托管。'
    : 'A distributed compute marketplace to rent GPU resources on demand. Supports fine-tuning and batch rendering workloads.'
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
      '文档工作：PDF 转图片、图片转 PDF、PDF 转 Word'
    ];
  }
  return [
    'E-commerce visuals: hero images, scenes, detail shots',
    'Marketing assets: posters, covers, social creatives, banners',
    'Content creation: stylized illustrations, avatars, quick assets',
    'Batch processing: convert, compress, resize, rotate/crop',
    'Docs workflow: PDF to images, images to PDF, PDF to Word'
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
      '电商产品图生成'
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
    'product image generator'
  ];
});
const faqTitle = computed(() => (currentLang.value === 'zh' ? '常见问题' : 'FAQ'));
const faqs = computed(() => {
  if (currentLang.value === 'zh') {
    return [
      {
        q: '文件会上传到服务器吗？',
        a: '格式工厂相关工具默认在浏览器本地处理；AI 工坊会将必要信息发送到模型服务以完成生成。'
      },
      {
        q: '从哪里开始更快？',
        a: '有参考图就用图生图；只有想法就用文生图。做电商图建议先填产品档案，再补充具体需求。'
      },
      {
        q: '如何判断卡在漏斗哪一步？',
        a: '已接入页面访问与关键动作事件，能看到进入页面、选择工具、开始处理/生成、下单等关键节点。'
      }
    ];
  }
  return [
    {
      q: 'Do files get uploaded?',
      a: 'Format Factory tools run locally in the browser by default; AI Workshop sends required inputs to the model service to generate results.'
    },
    {
      q: 'What is the fastest way to start?',
      a: 'Use image-to-image if you have reference images; use text-to-image if you only have an idea. For commerce shots, fill the product profile first.'
    },
    {
      q: 'How do I find where users drop off?',
      a: 'Page views and key action events are tracked, covering entry, tool selection, processing/generation, and ordering steps.'
    }
  ];
});

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
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;700;900&display=swap');

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
  font-family: 'Inter', sans-serif;
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
  font-family: 'JetBrains Mono', monospace;
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
  font-family: 'JetBrains Mono', monospace;
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
  font-family: 'JetBrains Mono', monospace;
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
  font-family: 'JetBrains Mono', monospace;
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
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 40px;
}

.tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--primary);
  border: 1px solid rgba(204, 255, 0, 0.3);
  padding: 4px 8px;
  border-radius: 2px;
  background: rgba(204, 255, 0, 0.05);
}

.cta-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 60px;
}

/* Button styles imported from cyberpunk.css */

.stats-row {
  display: flex;
  gap: 40px;
  border-top: 1px solid var(--border-color);
  padding-top: 24px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  color: var(--primary);
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
  font-family: 'JetBrains Mono', monospace;
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

/* 3D Reactor CSS Implementation */
.reactor-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 360px;
  height: 360px;
  perspective: 1200px;
  pointer-events: none;
}

.reactor-container {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  animation: reactor-float 6s ease-in-out infinite;
}

.reactor-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  box-shadow: 0 0 15px rgba(204, 255, 0, 0.05);
  transform-style: preserve-3d;
}

.ring-outer {
  width: 300px;
  height: 300px;
  border: 1px solid rgba(204, 255, 0, 0.1);
  border-top: 2px solid var(--primary);
  border-bottom: 2px solid var(--primary);
  box-shadow: 0 0 20px rgba(204, 255, 0, 0.1);
  animation: spin-slow 20s linear infinite;
}

.ring-outer::before {
  content: '';
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  bottom: 10px;
  border-radius: 50%;
  border: 1px dashed rgba(204, 255, 0, 0.2);
  animation: spin-reverse 30s linear infinite;
}

.ring-middle {
  width: 220px;
  height: 220px;
  border: 1px solid rgba(204, 255, 0, 0.05);
  border-left: 4px solid var(--primary);
  border-right: 4px solid var(--primary);
  box-shadow: 0 0 15px var(--primary-dim);
  animation: spin-reverse 12s linear infinite;
}

.ring-inner {
  width: 160px;
  height: 160px;
  border: 2px dotted var(--primary);
  opacity: 0.8;
  animation: spin-fast 8s linear infinite;
}

.ring-detail {
  width: 260px;
  height: 260px;
  border: 1px solid transparent;
  border-left: 1px solid rgba(204, 255, 0, 0.5);
  transform: translate(-50%, -50%) rotateX(60deg);
  animation: spin-3d 15s linear infinite;
}

.reactor-core-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
  background: radial-gradient(circle, #fff 0%, var(--primary) 40%, transparent 80%);
  border-radius: 50%;
  box-shadow:
    0 0 60px var(--primary),
    0 0 100px rgba(204, 255, 0, 0.4),
    inset 0 0 20px #fff;
  animation: pulse-glow 3s ease-in-out infinite alternate;
  filter: blur(2px);
}

.floating-data .bit {
  position: absolute;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--primary);
  opacity: 0;
  text-shadow: 0 0 5px var(--primary);
  animation: float-bit 4s infinite;
}

.bit-1 {
  top: 15%;
  left: 25%;
  animation-delay: 0s;
}
.bit-2 {
  top: 25%;
  right: 15%;
  animation-delay: 1.2s;
}
.bit-3 {
  bottom: 20%;
  left: 20%;
  animation-delay: 2.5s;
}
.bit-4 {
  bottom: 35%;
  right: 25%;
  animation-delay: 0.8s;
}
.bit-5 {
  top: 10%;
  right: 40%;
  animation-delay: 3s;
}
.bit-6 {
  bottom: 10%;
  left: 45%;
  animation-delay: 1.8s;
}

@keyframes spin-slow {
  0% {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  100% {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

@keyframes spin-reverse {
  0% {
    transform: translate(-50%, -50%) rotate(360deg);
  }
  100% {
    transform: translate(-50%, -50%) rotate(0deg);
  }
}

@keyframes spin-fast {
  0% {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  100% {
    transform: translate(-50%, -50%) rotate(-360deg);
  }
}

@keyframes spin-3d {
  0% {
    transform: translate(-50%, -50%) rotateX(60deg) rotate(0deg);
  }
  100% {
    transform: translate(-50%, -50%) rotateX(60deg) rotate(360deg);
  }
}

@keyframes pulse-glow {
  0% {
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0.7;
  }
  50% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 0.8;
  }
}

@keyframes reactor-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-15px);
  }
}

@keyframes float-bit {
  0% {
    transform: translateY(10px);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translateY(-30px);
    opacity: 0;
  }
}

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
    display: none;
    height: 300px;
  }

  .headline {
    font-size: 40px;
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
  font-family: 'JetBrains Mono', monospace;
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
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

/* Feature card styles imported from cyberpunk.css */

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--text-muted);
}

.module-id {
  flex: 1;
}

.badge {
  border: 1px solid var(--border-color);
  padding: 2px 6px;
  font-size: 9px;
}

.card-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #fff;
}

.card-subtitle {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 24px;
  letter-spacing: 1px;
}

.card-text {
  font-size: 13px;
  line-height: 1.6;
  color: #cbd5e1;
  margin-bottom: 32px;
  flex: 1;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 32px;
}

.card-tags span {
  font-size: 10px;
  color: var(--primary);
  background: rgba(204, 255, 0, 0.1);
  padding: 4px 8px;
  font-family: 'JetBrains Mono', monospace;
}

.card-action {
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
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

@media (max-width: 1024px) {
  .features-grid {
    grid-template-columns: 1fr;
    max-width: 500px;
  }
}

.content-section {
  padding: 90px 40px 110px;
  background: rgba(0, 0, 0, 0.32);
  position: relative;
  z-index: 2;
}

.content-inner {
  max-width: 1200px;
  margin: 0 auto;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  margin-top: 34px;
}

.content-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.22);
  padding: 18px 18px;
}

.content-card-title {
  font-size: 16px;
  font-weight: 800;
  margin: 0 0 12px;
  color: #fff;
}

.content-list {
  margin: 0;
  padding-left: 18px;
  color: #cbd5e1;
  font-size: 13px;
  line-height: 1.7;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  font-size: 11px;
  color: var(--primary);
  background: rgba(204, 255, 0, 0.1);
  border: 1px solid rgba(204, 255, 0, 0.22);
  padding: 6px 10px;
  font-family: 'JetBrains Mono', monospace;
}

.faq {
  margin-top: 26px;
}

.faq-item {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.18);
  padding: 10px 12px;
  margin-top: 10px;
}

.faq-q {
  cursor: pointer;
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 700;
  list-style: none;
}

.faq-item summary::-webkit-details-marker {
  display: none;
}

.faq-a {
  margin-top: 10px;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 1024px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
