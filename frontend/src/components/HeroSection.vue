<template>
  <section class="section hero-section">
    <div class="hero-content">
      <h1 class="logo-text" ref="logoRef">
        {{ t('hero.welcome') }}<span class="highlight">{{ t('hero.workshop') }}</span>
      </h1>
      <p class="subtitle" ref="subtitleRef">{{ t('hero.subtitle') }}</p>
      <p class="value-prop">{{ t('hero.valueProp') }}</p>
      <div class="hero-tags">
        <span class="tag">WebGL</span>
        <span class="tag">AI Native</span>
        <span class="tag">Interactive</span>
      </div>

      <!-- Interactive 3D Core -->
      <HeroInteractive />
    </div>
    <div class="scroll-hint">
      <span>{{ t('hero.scroll') }}</span>
      <div class="line"></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import gsap from 'gsap';
import { useLanguageStore } from '../stores/language';
import HeroInteractive from './HeroInteractive.vue';

const languageStore = useLanguageStore();
const { t } = languageStore;

const logoRef = ref<HTMLElement | null>(null);
const subtitleRef = ref<HTMLElement | null>(null);

onMounted(() => {
  // Hero Animations
  gsap.fromTo(
    logoRef.value,
    { y: 50, opacity: 0 },
    { y: 0, opacity: 1, duration: 1.5, ease: 'power3.out', delay: 0.5 }
  );

  gsap.fromTo(
    subtitleRef.value,
    { y: 30, opacity: 0 },
    { y: 0, opacity: 1, duration: 1.5, ease: 'power3.out', delay: 0.8 }
  );

  gsap.fromTo(
    '.hero-tags .tag',
    { y: 20, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.8, stagger: 0.2, ease: 'power2.out', delay: 1.2 }
  );

  gsap.fromTo('.scroll-hint', { opacity: 0 }, { opacity: 1, duration: 1, delay: 2 });
});
</script>

<style scoped>
.section {
  min-height: 100vh;
  width: 100%;
  max-width: 1400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120px 20px 80px;
  box-sizing: border-box;
}

.hero-section {
  text-align: center;
  position: relative;
}

.hero-content {
  /* margin-top: auto; */
  margin-bottom: auto;
}

.logo-text {
  font-size: 5rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin: 0;
  color: #fff;
  text-shadow: 0 0 40px rgba(56, 189, 248, 0.2);
}

.highlight {
  color: #38bdf8;
  text-shadow: 0 0 20px rgba(56, 189, 248, 0.5);
}

.subtitle {
  font-size: 1.8rem;
  color: #cbd5e1;
  margin-top: 24px;
  font-weight: 400;
  letter-spacing: 0.02em;
}

.value-prop {
  font-size: 1.2rem;
  color: #94a3b8;
  margin-top: 12px;
  font-weight: 300;
  letter-spacing: 0.1em;
}

.hero-tags {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}

.tag {
  font-size: 0.9rem;
  color: #38bdf8;
  padding: 6px 16px;
  border-radius: 100px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.scroll-hint {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  color: #64748b;
  opacity: 0;
}

.line {
  width: 1px;
  height: 40px;
  background: linear-gradient(to bottom, #64748b, transparent);
}

@media (max-width: 768px) {
  .logo-text {
    font-size: 3rem;
  }

  .subtitle {
    font-size: 1.2rem;
  }

  .value-prop {
    font-size: 1rem;
  }
}
</style>
