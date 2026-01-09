<template>
  <div class="landing-page">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

    <div class="content-wrapper">
      <!-- Header -->
      <header class="header">
        <div class="logo">
          <span class="logo-text">Nth Me</span>
        </div>

        <nav class="nav-links">
          <router-link to="/agentimg/format-factory" class="nav-item">格式工厂</router-link>
          <router-link to="/agentimg/ai" class="nav-item active">AI工坊</router-link>
          <router-link to="/agentimg/market" class="nav-item">算力商城</router-link>
        </nav>

        <div class="header-right">
          <div class="lang-container" @click="isLangMenuOpen = !isLangMenuOpen">
            <button class="lang-switch" type="button">
              <span class="globe-icon">🌐</span> {{ langLabel }}
              <span class="arrow" :class="{ open: isLangMenuOpen }">⌄</span>
            </button>
            <transition name="dropdown-fade">
              <div v-if="isLangMenuOpen" class="lang-dropdown">
                <div
                  class="lang-option"
                  :class="{ active: currentLang === 'zh' }"
                  @click.stop="selectLanguage('zh')"
                >
                  ZH · 中文
                </div>
                <div
                  class="lang-option"
                  :class="{ active: currentLang === 'en' }"
                  @click.stop="selectLanguage('en')"
                >
                  EN · English
                </div>
              </div>
            </transition>
          </div>
          <button class="login-btn nth-login-btn" type="button" @click="goLogin">
            {{ loginText }}
          </button>
        </div>
      </header>

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
            <router-link to="/agentimg/ai" class="btn primary-btn">
              {{ ctaWorkshop }} <span class="arrow">→</span>
            </router-link>
            <router-link to="/agentimg/format-factory" class="btn outline-btn">{{
              ctaFormatFactory
            }}</router-link>
            <router-link to="/agentimg/market" class="btn outline-btn">{{ ctaMarket }}</router-link>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <div class="stat-label">{{ statLabel1 }}</div>
              <div class="stat-value">~2.5s</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">{{ statLabel2 }}</div>
              <div class="stat-value">20+</div>
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
                  <div class="reactor-core-glow"></div>
                </div>
                <div class="floating-data">
                  <span class="bit bit-1">0</span>
                  <span class="bit bit-2">1</span>
                  <span class="bit bit-3">1</span>
                  <span class="bit bit-4">0</span>
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
          <div class="feature-card" @click="router.push('/agentimg/ai')">
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

          <div class="feature-card" @click="router.push('/agentimg/format-factory')">
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

          <div class="feature-card" @click="router.push('/agentimg/market')">
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

      <GlobalFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import GlobalFooter from '../components/GlobalFooter.vue';
import { useLanguageStore } from '@/stores/language';
import { useLoginModel } from '@/stores';
import { isLocalLoggedIn } from '@/login/session';

const router = useRouter();
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const isLangMenuOpen = ref(false);
let animationId: number;

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const loginStore = useLoginModel();

const authTick = ref(0);
const isAuthed = computed(() => {
  return authTick.value >= 0 && isLocalLoggedIn();
});

const handleAuthChanged = () => {
  authTick.value++;
};

const selectLanguage = (lang: 'zh' | 'en') => {
  languageStore.setLanguage(lang);
  isLangMenuOpen.value = false;
};

const langLabel = computed(() => (currentLang.value === 'zh' ? 'ZH' : 'EN'));

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
    ? '从 AI 智能创作到格式批量转换，打造一站式影像处理解决方案。深度集成 AI 算力引擎与高性能传统算法，20+ 专业工具覆盖图片全生命周期。支持双模型 AI 生成、多种格式转换，纯前端处理确保数据隐私安全。'
    : 'From AI creation to batch format conversion, a one-stop imaging toolkit. Deeply integrated AI compute and high-performance classic algorithms, with 20+ professional tools covering the full image lifecycle. Dual-model AI generation, multi-format conversion, and client-side processing for privacy.'
);

const ctaWorkshop = computed(() => (currentLang.value === 'zh' ? 'AI 工坊' : 'AI Workshop'));
const ctaFormatFactory = computed(() =>
  currentLang.value === 'zh' ? '格式工厂' : 'Format Factory'
);
const ctaMarket = computed(() => (currentLang.value === 'zh' ? '算力商城' : 'Compute Market'));

const loginText = computed(() => {
  if (isAuthed.value) return currentLang.value === 'zh' ? '账号' : 'ACCOUNT';
  return currentLang.value === 'zh' ? '登录' : 'LOGIN';
});
const statusText = computed(() =>
  currentLang.value === 'zh' ? '工具库在线 SYS v2.0.4' : 'TOOLBOX ONLINE SYS v2.0.4'
);
const tag1 = computed(() => (currentLang.value === 'zh' ? 'AI 驱动' : 'AI_POWERED'));
const tag2 = computed(() => (currentLang.value === 'zh' ? '纯前端' : 'CLIENT_SIDE'));
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
    ? 'WebP/JPEG/PNG 全格式支持，纯前端处理保障隐私。支持批量压缩、去水印、PDF 转换等 20+ 实用工具。'
    : 'Full format support (WebP/JPEG/PNG) with client-side processing for privacy. 20+ utilities like batch compress, watermark removal, and PDF conversion.'
);
const feature3Title = computed(() => (currentLang.value === 'zh' ? '算力商城' : 'Compute Market'));
const feature3Desc = computed(() =>
  currentLang.value === 'zh'
    ? '分布式算力租赁平台，按需购买 GPU 资源。支持模型微调、批量渲染任务托管。'
    : 'A distributed compute marketplace to rent GPU resources on demand. Supports fine-tuning and batch rendering workloads.'
);

const goLogin = () => {
  if (isAuthed.value) {
    router.push('/login/account');
    return;
  }
  const returnTo = router.currentRoute.value.fullPath;
  loginStore.open({ mode: 'login', returnTo });
};

// Matrix Rain Effect
const initMatrixRain = () => {
  const canvas = bgCanvas.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const chars = '01ABCDEF';
  const fontSize = 14;
  const columns = Math.ceil(canvas.width / fontSize);
  const drops: number[] = new Array(columns).fill(1).map(() => Math.random() * -100); // Random start positions

  const draw = () => {
    // Semi-transparent black to create trail effect
    ctx.fillStyle = 'rgba(5, 5, 5, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F0'; // Green text
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
      const text = chars.charAt(Math.floor(Math.random() * chars.length));

      // Randomly brighter characters
      if (Math.random() > 0.95) {
        ctx.fillStyle = '#ccff00';
      } else {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
      }

      ctx.fillText(text, i * fontSize, drops[i] * fontSize);

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }

    animationId = requestAnimationFrame(draw);
  };

  draw();
};

const handleResize = () => {
  if (bgCanvas.value) {
    bgCanvas.value.width = window.innerWidth;
    bgCanvas.value.height = window.innerHeight;
  }
};

onMounted(() => {
  initMatrixRain();
  window.addEventListener('resize', handleResize);
  handleAuthChanged();
  window.addEventListener('app-auth-changed', handleAuthChanged as EventListener);
});

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('app-auth-changed', handleAuthChanged as EventListener);
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
  background-color: var(--bg-dark);
  color: var(--text-main);
  font-family: 'Inter', sans-serif;
  overflow: hidden;
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
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  opacity: 0.4;
}

.content-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: radial-gradient(circle at 50% 50%, rgba(5, 5, 5, 0.5) 0%, rgba(5, 5, 5, 0.9) 100%);
}

/* Header */
.header {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  /* backdrop-filter: blur(5px); */
}

.logo-text {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 24px;
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
  transition: transform 0.3s ease;
  display: inline-block;
}

.lang-switch .arrow.open {
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
  width: 300px;
  height: 300px;
  perspective: 1000px;
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
  box-shadow: 0 0 10px var(--primary-dim);
}

.ring-outer {
  width: 260px;
  height: 260px;
  border: 2px dashed rgba(204, 255, 0, 0.3);
  animation: spin-slow 20s linear infinite;
}

.ring-middle {
  width: 200px;
  height: 200px;
  border-left: 2px solid var(--primary);
  border-right: 2px solid var(--primary);
  border-top: 2px solid transparent;
  border-bottom: 2px solid transparent;
  animation: spin-reverse 10s linear infinite;
}

.ring-inner {
  width: 140px;
  height: 140px;
  border: 4px dotted var(--primary);
  opacity: 0.7;
  animation: spin-fast 5s linear infinite;
}

.reactor-core-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
  height: 60px;
  background: radial-gradient(circle, #fff, var(--primary));
  border-radius: 50%;
  box-shadow:
    0 0 40px var(--primary),
    0 0 80px var(--primary);
  animation: pulse-glow 2s ease-in-out infinite alternate;
}

.floating-data .bit {
  position: absolute;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  color: var(--primary);
  opacity: 0;
  animation: float-bit 3s infinite;
}

.bit-1 {
  top: 20%;
  left: 20%;
  animation-delay: 0s;
}
.bit-2 {
  top: 30%;
  right: 20%;
  animation-delay: 1s;
}
.bit-3 {
  bottom: 20%;
  left: 30%;
  animation-delay: 2s;
}
.bit-4 {
  bottom: 30%;
  right: 30%;
  animation-delay: 1.5s;
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
    transform: translate(-50%, -50%) rotate(360deg) rotateX(45deg);
  }
  100% {
    transform: translate(-50%, -50%) rotate(0deg) rotateX(45deg);
  }
}

@keyframes spin-fast {
  0% {
    transform: translate(-50%, -50%) rotate(0deg) rotateY(60deg);
  }
  100% {
    transform: translate(-50%, -50%) rotate(360deg) rotateY(60deg);
  }
}

@keyframes pulse-glow {
  0% {
    transform: translate(-50%, -50%) scale(0.9);
    opacity: 0.8;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 1;
  }
}

@keyframes reactor-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes float-bit {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: translateY(-20px);
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
    height: 300px;
  }

  .headline {
    font-size: 40px;
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
</style>
