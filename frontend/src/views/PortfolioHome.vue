<template>
  <div class="portfolio-container">
    <!-- Universe Background -->
    <UniverseBackground ref="universeRef" :mode="config.mode" />

    <!-- Custom Cursor -->
    <CustomCursor />

    <!-- Scroll Progress -->
    <ScrollProgress />

    <!-- Social Links -->
    <SocialLinks />

    <!-- Config Panel -->
    <ConfigPanel v-model="config.mode" class="desktop-config-panel" />

    <!-- Language Switcher -->
    <div class="lang-switch">
      <span :class="{ active: currentLang === 'en' }" @click.stop="setLanguage('en')">EN</span>
      <span class="divider">/</span>
      <span :class="{ active: currentLang === 'zh' }" @click.stop="setLanguage('zh')">CN</span>
    </div>

    <!-- Sidebar Navigation -->
    <Sidebar>
      <template #mobile-header-extra>
        <ConfigPanel v-model="config.mode" :embedded="true" />
      </template>
    </Sidebar>

    <main class="content-flow">
      <!-- Hero Section -->
      <HeroSection id="hero" />

      <!-- Projects Section -->
      <ProjectsSection
        id="projects"
        @hover-start="onHoverStart"
        @hover-end="onHoverEnd"
        @navigate="handleNavigation"
      />

      <!-- About Section -->
      <AboutSection id="about" />

      <!-- Skills Section -->
      <SkillsSection id="skills" />

      <!-- Experience Section -->
      <ExperienceSection id="experience" />

      <!-- Testimonials Section -->
      <TestimonialsSection id="testimonials" />

      <!-- Footer Section -->
      <FooterSection />
    </main>

    <!-- Live2D Agent Widget -->
    <Agent />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import gsap from 'gsap';
import { useLanguageStore } from '../stores/language';
import { storeToRefs } from 'pinia';

// Components
import UniverseBackground from '../components/UniverseBackground.vue';
import CustomCursor from '../components/CustomCursor.vue';
import ScrollProgress from '../components/ScrollProgress.vue';
import SocialLinks from '../components/SocialLinks.vue';
import ConfigPanel from '../components/ConfigPanel.vue';
import Sidebar from '../components/Sidebar.vue';
import HeroSection from '../components/HeroSection.vue';
import ProjectsSection from '../components/ProjectsSection.vue';
import AboutSection from '../components/AboutSection.vue';
import SkillsSection from '../components/SkillsSection.vue';
import ExperienceSection from '../components/ExperienceSection.vue';
import TestimonialsSection from '../components/TestimonialsSection.vue';
import FooterSection from '../components/FooterSection.vue';
import Agent from '../agent/components/Agent.vue';

const router = useRouter();
const universeRef = ref<InstanceType<typeof UniverseBackground> | null>(null);
const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);
const { setLanguage } = languageStore;

const config = reactive({
  mode: '0' // 0: Ripple, 1: Kaleidoscope, 2: Starburst
});

const onHoverStart = () => {
  // Trigger subtle effect on hover
  universeRef.value?.triggerEffect(0.5);
};

const onHoverEnd = () => {
  // Optional logic
};

const handleNavigation = (route: string) => {
  if (route === '#') return;

  // Exit animation
  const tl = gsap.timeline({
    onComplete: () => {
      router.push(route);
    }
  });

  tl.to('.content-flow', { opacity: 0, y: -50, duration: 0.5 });

  // Trigger strong effect on navigation
  universeRef.value?.triggerEffect(5.0);
};
</script>

<style scoped>
:root {
  --bg-color: #0f172a;
  --text-main: #f1f5f9;
  --text-secondary: #cbd5e1;
  --accent-color: #38bdf8;
  --accent-glow: rgba(56, 189, 248, 0.3);
  --card-bg: rgba(30, 41, 59, 0.7);
  --border-color: rgba(255, 255, 255, 0.15);
}

.portfolio-container {
  width: 100%;
  height: 100vh;
  overflow-y: scroll; /* Force scroll behavior but hide bar */
  overflow-x: hidden;
  position: relative;
  background-color: #050505;
  background-image: radial-gradient(circle at 50% 50%, #111827 0%, #000000 100%);
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--text-main);
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.portfolio-container::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
  width: 0;
  height: 0;
}

.content-flow {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.lang-switch {
  position: fixed;
  top: 20px;
  right: 24px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  backdrop-filter: blur(8px);
}

.lang-switch span {
  font-size: 0.85rem;
  color: #94a3b8;
}

.lang-switch .divider {
  color: #475569;
}

.lang-switch .active {
  color: #38bdf8;
}

@media (max-width: 980px) {
  .lang-switch {
    top: 16px;
    right: 16px;
    padding: 6px 10px;
    gap: 6px;
  }

  .desktop-config-panel {
    display: none;
  }
}
</style>
