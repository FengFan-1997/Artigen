<template>
  <!-- Mobile Header (Visible only on mobile) -->
  <div class="mobile-header">
    <div class="mobile-toggle" @click="toggleMobileMenu" :class="{ active: isMobileOpen }">
      <span class="bar"></span>
      <span class="bar"></span>
      <span class="bar"></span>
    </div>
    <div class="mobile-title">Menu</div>
    <div style="margin-left: auto">
      <slot name="mobile-header-extra"></slot>
    </div>
  </div>

  <!-- Mobile Overlay -->
  <div class="mobile-overlay" :class="{ active: isMobileOpen }" @click="closeMobileMenu"></div>

  <!-- Sidebar Navigation -->
  <nav class="sidebar-wrapper" :class="{ collapsed: isCollapsed, 'mobile-open': isMobileOpen }">
    <div class="glass-panel">
      <div class="toggle-area" @click="toggleSidebar">
        <span class="toggle-line"></span>
        <span class="toggle-line short"></span>
      </div>

      <div class="nav-list">
        <a
          v-for="item in navItems"
          :key="item.id"
          :href="item.target"
          class="nav-item"
          :class="{ active: activeSection === item.id }"
          @click.prevent="handleNavClick(item.target)"
        >
          <div class="indicator-container">
            <div class="indicator-dot"></div>
            <div class="indicator-line"></div>
          </div>
          <span class="nav-label">
            {{ t(`nav.${item.id}`) }}
          </span>
        </a>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useLanguageStore } from '../stores/language';

const languageStore = useLanguageStore();
const { t } = languageStore;

const isCollapsed = ref(false);
const isMobileOpen = ref(false);
const activeSection = ref('hero');

const navItems = [
  { id: 'hero', target: '#hero' },
  { id: 'projects', target: '#projects' },
  { id: 'about', target: '#about' },
  { id: 'skills', target: '#skills' },
  { id: 'experience', target: '#experience' },
  { id: 'testimonials', target: '#testimonials' }
];

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
};

const toggleMobileMenu = () => {
  isMobileOpen.value = !isMobileOpen.value;
};

const closeMobileMenu = () => {
  isMobileOpen.value = false;
};

const handleNavClick = (target: string) => {
  scrollTo(target);
  if (window.innerWidth <= 768) {
    closeMobileMenu();
  }
};

const scrollTo = (target: string) => {
  const element = document.querySelector(target);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' });
  }
};

const checkScroll = () => {
  const viewportHeight = window.innerHeight;
  let current = '';
  let minDistance = Infinity;

  navItems.forEach((item) => {
    const element = document.querySelector(item.target);
    if (element instanceof HTMLElement) {
      const rect = element.getBoundingClientRect();
      // Calculate distance from center of viewport
      const distance = Math.abs(rect.top + rect.height / 2 - viewportHeight / 2);

      // Consider an element active if it covers the center of the screen
      // or if it's the closest to the center
      if (distance < minDistance) {
        minDistance = distance;
        current = item.id;
      }
    }
  });

  if (current) {
    activeSection.value = current;
  }
};

onMounted(() => {
  // Try to find the scroll container
  const container = document.querySelector('.portfolio-container') || window;
  container.addEventListener('scroll', checkScroll, { passive: true });

  // Initial check
  checkScroll();
});

onBeforeUnmount(() => {
  const container = document.querySelector('.portfolio-container') || window;
  container.removeEventListener('scroll', checkScroll);
});
</script>

<style scoped>
/* Mobile Header Styles */
.mobile-header {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 60px;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  z-index: 100;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  box-sizing: border-box;
}

.mobile-toggle {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 24px;
  height: 18px;
  cursor: pointer;
}

.mobile-toggle .bar {
  width: 100%;
  height: 2px;
  background-color: #fff;
  border-radius: 2px;
  transition: all 0.3s ease;
}

.mobile-title {
  margin-left: 16px;
  color: #fff;
  font-weight: 600;
  font-size: 1.1rem;
}

/* Sidebar Wrapper - Desktop Default */
.sidebar-wrapper {
  position: fixed;
  left: 2rem;
  top: 40%; /* Moved up from 45% */
  transform: translateY(-50%);
  z-index: 50;
  transition: all 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  max-height: 80vh;
}

.glass-panel {
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 1.2rem 0.6rem; /* Reduced padding further */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  transition: all 0.6s ease;
}

.collapsed .glass-panel {
  padding: 1.2rem 0.5rem;
  background: rgba(15, 23, 42, 0.2);
}

.toggle-area {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0.5rem;
  opacity: 0.8;
  transition: opacity 0.3s;
}

.toggle-area:hover {
  opacity: 1;
}

.toggle-line {
  width: 20px;
  height: 2px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 2px;
  transition: width 0.3s;
}

.toggle-line.short {
  width: 12px;
}

.collapsed .toggle-line {
  width: 16px;
}
.collapsed .toggle-line.short {
  width: 16px;
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 1.2rem; /* Reduced gap */
}

.nav-item {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.3s;
  position: relative;
  height: 32px;
}

.nav-item:hover,
.nav-item.active {
  color: #fff;
}

.indicator-container {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.indicator-dot {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.nav-item.active .indicator-dot {
  transform: scale(1.5);
  box-shadow: 0 0 10px currentColor;
}

.nav-label {
  margin-left: 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  opacity: 1;
  transform: translateX(0);
  transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  white-space: nowrap;
}

.collapsed .nav-label {
  opacity: 0;
  transform: translateX(-10px);
  pointer-events: none;
  width: 0;
  overflow: hidden;
  margin-left: 0;
}

/* Mobile Adaptation */
@media (max-width: 980px) {
  .mobile-header {
    display: flex;
  }

  .sidebar-wrapper {
    position: fixed;
    top: 60px; /* Below header */
    left: 0;
    width: 250px;
    height: calc(100vh - 60px);
    transform: translateX(-100%);
    z-index: 90;
    transition: transform 0.3s ease;
    padding: 0;
    pointer-events: none;
  }

  .sidebar-wrapper.mobile-open {
    transform: translateX(0);
    pointer-events: auto;
  }

  .glass-panel {
    height: 100vh;
    width: 250px; /* Drawer width */
    border-radius: 0 24px 24px 0;
    background: rgba(15, 23, 42, 0.95);
    margin: 0;
    padding: 2rem 1.5rem;
    align-items: flex-start;
  }

  .toggle-area {
    display: none; /* Hide desktop toggle */
  }

  .nav-list {
    width: 100%;
  }

  .nav-label {
    display: block; /* Show text on mobile drawer */
    opacity: 1;
    width: auto;
    margin-left: 1rem;
  }

  .collapsed .nav-label {
    /* Reset collapsed state styles for mobile if shared */
    display: block;
    opacity: 1;
    width: auto;
    transform: none;
  }

  .mobile-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 80;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
  }

  .mobile-overlay.active {
    opacity: 1;
    pointer-events: auto;
  }
}

/* Tablet Adaptation (980px - 1280px) */
@media (min-width: 980px) and (max-width: 1280px) {
  .sidebar-wrapper {
    left: 0;
  }

  .glass-panel {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: none;
  }
}
</style>
