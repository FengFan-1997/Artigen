<template>
  <section class="section projects-section" id="projects">
    <div class="content-wrapper">
      <div class="section-header">
        <h2 class="section-title">{{ t('projects.title') }}</h2>
        <div class="project-filter">
          <button
            v-for="filter in filters"
            :key="filter"
            class="filter-btn"
            :class="{ active: activeFilter === filter }"
            @click="setFilter(filter)"
          >
            {{ filter === 'All' ? t('projects.filters.all') : filter }}
          </button>
        </div>
      </div>

      <div class="projects-list">
        <div
          v-for="(item, index) in filteredProjects"
          :key="item.id"
          class="project-card"
          :class="{ reversed: index % 2 !== 0 }"
          ref="projectCardsRef"
          @mouseenter="onHover(index)"
          @mouseleave="onLeave(index)"
          @click="onCardClick(item.route)"
        >
          <div class="card-visual-container" :style="getCardStyle(index)">
            <img
              :src="item.image"
              :srcset="getSrcSet(item.image)"
              sizes="(max-width: 768px) 400px, (max-width: 1200px) 800px, 1200px"
              class="plain-image"
              loading="lazy"
              decoding="async"
              :alt="item.title"
            />
          </div>

          <div class="card-content">
            <div class="card-header">
              <span class="card-number">0{{ index + 1 }}</span>
              <div class="card-tags" v-if="item.tags">
                <span v-for="tag in item.tags" :key="tag" class="mini-tag">{{ tag }}</span>
              </div>
            </div>
            <h2 class="card-title">{{ item.title }}</h2>
            <p class="card-desc">{{ item.desc }}</p>
            <div class="card-action">
              <span>{{ t('projects.viewProject') }}</span>
              <span class="arrow-icon">→</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import gsap from 'gsap';
import { useLanguageStore } from '../stores/language';

const languageStore = useLanguageStore();
const { t } = languageStore;

const emit = defineEmits<{
  (e: 'hover-start'): void;
  (e: 'hover-end'): void;
  (e: 'navigate', route: string): void;
}>();

const projectCardsRef = ref<HTMLElement[]>([]);
const activeFilter = ref('All');
const filters = ['All', 'Vue 3', 'Three.js', 'WebGL', 'AI', 'SaaS', 'DeFi'];
const cardProgress = ref<number[]>([]); // Store scroll progress for each card
const hoveredIndex = ref<number | null>(null);

const navItems = computed(() => [
  {
    id: 'ingredients',
    title: t('projects.items.ingredients.title'),
    desc: t('projects.items.ingredients.desc'),
    route: '/ingredient',
    icon: '🧬',
    image:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=800&auto=format&fit=crop', // Food/Ingredients (replaced)
    tags: ['Vue 3', 'AI', 'Automation']
  },
  {
    id: 'gemini',
    title: t('projects.items.gemini.title'),
    desc: t('projects.items.gemini.desc'),
    route: '/gemini-chat',
    icon: '💬',
    image:
      'https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=800&auto=format&fit=crop', // AI/Tech
    tags: ['Vue 3', 'AI', 'NLP']
  },
  {
    id: 'polyglot',
    title: t('projects.items.polyglot.title'),
    desc: t('projects.items.polyglot.desc'),
    route: '/translator',
    icon: '🌐',
    image:
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop', // Globe/Network
    tags: ['Vue 3', 'AI', 'Tools']
  },
  {
    id: 'storyteller',
    title: t('projects.items.storyteller.title'),
    desc: t('projects.items.storyteller.desc'),
    route: '/storyteller',
    icon: '📖',
    image:
      'https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=800&auto=format&fit=crop', // Book/Fantasy
    tags: ['Vue 3', 'AI', 'Creative']
  },
  {
    id: 'christmas',
    title: t('projects.items.christmas.title'),
    desc: t('projects.items.christmas.desc'),
    route: '/christmas-tree',
    icon: '🎄',
    image:
      'https://images.unsplash.com/photo-1512389142860-9c449e58a543?q=80&w=800&auto=format&fit=crop', // Better Christmas Tree
    tags: ['Three.js', 'Computer Vision', 'Interactive']
  },
  {
    id: 'nexus',
    title: t('projects.items.nexus.title'),
    desc: t('projects.items.nexus.desc'),
    route: '/nexus-dashboard',
    icon: '📊',
    image:
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop', // Data Dashboard
    tags: ['Vue 3', 'WebGL', 'FinTech']
  },
  {
    id: 'market',
    title: t('projects.items.market.title'),
    desc: t('projects.items.market.desc'),
    route: '/aether-market',
    icon: '💎',
    image:
      'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=800&auto=format&fit=crop',
    tags: ['Web3', 'Three.js', 'DeFi']
  },
  {
    id: 'resume',
    title: t('projects.items.resume.title'),
    desc: t('projects.items.resume.desc'),
    route: '/resume-forge',
    icon: '📄',
    image:
      'https://images.unsplash.com/photo-1586281380349-632531db7ed4?q=80&w=800&auto=format&fit=crop',
    tags: ['AI', 'NLP', 'Recruitment']
  },
  {
    id: 'audit',
    title: t('projects.items.audit.title'),
    desc: t('projects.items.audit.desc'),
    route: '/code-guardian',
    icon: '🛡️',
    image:
      'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?q=80&w=800&auto=format&fit=crop',
    tags: ['Security', 'Blockchain', 'Automation']
  },
  {
    id: 'travel',
    title: t('projects.items.travel.title'),
    desc: t('projects.items.travel.desc'),
    route: '/travel-planner',
    icon: '✈️',
    image:
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=800&auto=format&fit=crop',
    tags: ['GenAI', 'Personalization', 'Travel']
  },
  {
    id: 'aippt',
    title: t('projects.items.aippt.title'),
    desc: t('projects.items.aippt.desc'),
    route: '/ai-ppt',
    icon: '📽️',
    image:
      'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=800&auto=format&fit=crop',
    tags: ['AI', 'Vue 3', 'Productivity']
  }
]);

const filteredProjects = computed(() => {
  if (activeFilter.value === 'All') {
    return navItems.value;
  }
  return navItems.value.filter((item) => item.tags.includes(activeFilter.value));
});

const setFilter = (filter: string) => {
  activeFilter.value = filter;
};

// Animation Loop for Scroll Effect
let animationFrameId: number;

const updateScrollEffect = () => {
  if (!projectCardsRef.value.length) return;

  const viewportHeight = window.innerHeight;
  const newProgress: number[] = [];

  projectCardsRef.value.forEach((card) => {
    if (!card) {
      newProgress.push(0);
      return;
    }
    const rect = card.getBoundingClientRect();

    // Calculate progress: 0 at center, 1 at bottom, -1 at top
    const center = rect.top + rect.height / 2;
    const distFromCenter = center - viewportHeight / 2;
    let progress = distFromCenter / (viewportHeight / 2);

    // Clamp
    progress = Math.max(-1, Math.min(1, progress));

    newProgress.push(progress);
  });

  cardProgress.value = newProgress;
  animationFrameId = requestAnimationFrame(updateScrollEffect);
};

const getSrcSet = (url: string) => {
  // Remove existing width param if present to avoid conflicts
  const base = url.replace(/&w=\d+/, '');
  return `${base}&w=400 400w, ${base}&w=800 800w, ${base}&w=1200 1200w`;
};

const getCardStyle = (index: number) => {
  const progress = cardProgress.value[index] || 0;
  const isHovered = hoveredIndex.value === index;

  const enter = Math.max(0, progress);

  const rotation = isHovered ? 0 : enter * 25;
  const opacity = 1 - enter * 0.4;
  const scale = (0.9 + (1 - enter) * 0.1) * (isHovered ? 1.05 : 1);
  const maskTop = `${enter * 35}%`;

  return {
    '--card-rotation': `${rotation}deg`,
    '--card-opacity': opacity,
    '--card-scale': scale,
    '--mask-top': maskTop,
    zIndex: isHovered ? 10 : 1
  };
};

// Watch for filter changes to re-animate
watch(activeFilter, () => {
  nextTick(() => {
    gsap.fromTo(
      projectCardsRef.value,
      { y: 50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, stagger: 0.1, ease: 'power2.out' }
    );
  });
});

const onHover = (index: number) => {
  hoveredIndex.value = index;
  emit('hover-start');
};

const onLeave = (_index: number) => {
  hoveredIndex.value = null;
  emit('hover-end');
};

const onCardClick = (route: string) => {
  emit('navigate', route);
};

onMounted(() => {
  // Start scroll loop
  updateScrollEffect();

  // Keep existing IntersectionObserver for fade-in
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  projectCardsRef.value.forEach((card) => {
    observer.observe(card);
  });
});

onBeforeUnmount(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
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

.content-wrapper {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.section-title {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 60px;
  text-align: center;
  background: linear-gradient(to right, #fff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
}

.projects-section {
  gap: 100px;
}

.section-header {
  margin-bottom: 80px;
  text-align: center;
}

.project-filter {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: -30px;
}

.filter-btn {
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 8px 20px;
  border-radius: 100px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.3s;
}

.filter-btn:hover,
.filter-btn.active {
  background: #38bdf8;
  color: #0f172a;
  border-color: #38bdf8;
}

.projects-list {
  display: flex;
  flex-direction: column;
  gap: 80px;
}

.project-card {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 40px;
  align-items: center;
  opacity: 0;
  transform: translateY(50px);
  transition:
    opacity 0.8s ease-out,
    transform 0.8s ease-out;
  cursor: pointer;
  background: rgba(30, 41, 59, 0.3);
  /* backdrop-filter: blur(12px); */
  /* -webkit-backdrop-filter: blur(12px); */
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 32px;
  padding: 40px;
  position: relative;
  overflow: hidden;
}

.project-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(
    800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(255, 255, 255, 0.06),
    transparent 40%
  );
  opacity: 0;
  transition: opacity 0.5s;
  pointer-events: none;
  z-index: 0;
}

.project-card:hover::before {
  opacity: 1;
}

.project-card.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.project-card.reversed {
  grid-template-columns: 0.9fr 1.1fr;
  direction: ltr;
}
.project-card.reversed .card-visual-container {
  order: 2;
}
.project-card.reversed .card-content {
  order: 1;
  text-align: right;
  align-items: flex-end;
}

.card-visual-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16/10;
  border-radius: 20px;
  overflow: hidden;
  transform: translateZ(0); /* Force GPU acceleration and fix overflow clipping */
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  will-change: transform;
  backface-visibility: hidden;
  -webkit-mask-image: -webkit-radial-gradient(
    white,
    black
  ); /* Fix for Safari border-radius overflow */
}

.plain-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(var(--card-scale, 1));
  opacity: var(--card-opacity, 1);
  transition:
    transform 0.6s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.6s ease;
  display: block;
  will-change: transform;
}

/* Remove conflicting hover effect since we use JS-driven scale */
/* .project-card:hover .plain-image {
  transform: scale(1.1);
} */

.card-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
  z-index: 1;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.project-card.reversed .card-header {
  flex-direction: row-reverse;
}

.card-number {
  font-family: 'Space Mono', monospace;
  font-size: 3rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.05);
  line-height: 1;
  position: absolute;
  top: -40px;
  left: -20px;
  pointer-events: none;
}

.project-card.reversed .card-number {
  left: auto;
  right: 0px;
}

.card-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mini-tag {
  font-size: 0.75rem;
  padding: 6px 12px;
  border-radius: 100px;
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.2);
  letter-spacing: 0.05em;
  font-weight: 500;
}

.card-title {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1.1;
  color: #f1f5f9;
  margin: 0;
}

.card-desc {
  font-size: 1.1rem;
  color: #94a3b8;
  line-height: 1.6;
  margin: 0;
}

.card-action {
  margin-top: 16px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  background: rgba(255, 255, 255, 0.1);
  padding: 12px 24px;
  border-radius: 100px;
  align-self: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.project-card.reversed .card-action {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.card-action:hover {
  background: #fff;
  color: #000;
  gap: 16px;
}

/* Mobile Adaptation */
@media (max-width: 900px) {
  .projects-list {
    gap: 40px;
  }

  .project-card {
    grid-template-columns: 1fr;
    gap: 32px;
    padding: 24px;
    border-radius: 24px;
  }

  .project-card.reversed {
    grid-template-columns: 1fr;
  }

  .card-visual-container,
  .project-card.reversed .card-visual-container {
    order: 1;
    aspect-ratio: 16/9;
  }

  .card-content,
  .project-card.reversed .card-content {
    order: 2;
    text-align: left;
    align-items: flex-start;
  }

  .card-header,
  .project-card.reversed .card-header {
    flex-direction: row;
  }

  .card-number {
    position: relative;
    top: auto;
    left: auto;
    right: auto;
    font-size: 1.2rem;
    color: #38bdf8;
    opacity: 0.8;
  }

  .card-action,
  .project-card.reversed .card-action {
    align-self: flex-start;
    flex-direction: row;
    width: 100%;
    justify-content: center;
  }

  .card-title {
    font-size: 1.8rem;
  }
}

@media (max-width: 480px) {
  .project-filter {
    gap: 8px;
  }
  .filter-btn {
    padding: 6px 14px;
    font-size: 0.8rem;
  }

  .section {
    padding: 80px 16px 60px;
  }
}
</style>
