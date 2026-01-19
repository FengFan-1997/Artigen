<template>
  <div
    class="hero-carousel"
    @mouseenter="pauseAutoPlay"
    @mouseleave="resumeAutoPlay"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <div class="carousel-track" :style="{ transform: `translateX(-${currentIndex * 100}%)` }">
      <div
        v-for="(slide, index) in slides"
        :key="index"
        class="carousel-slide"
        @click="$emit('navigate', slide.route, slide.id)"
      >
        <div class="slide-image-wrapper">
          <img :src="slide.image" :alt="slide.title" class="slide-image" />
          <div class="slide-overlay">
            <div class="slide-header">
              <span class="brand-text">Artigen</span>
            </div>
            <div class="slide-content">
              <h3 class="slide-title">{{ slide.title }}</h3>
              <p v-if="slide.desc" class="slide-desc">{{ slide.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <button class="nav-btn prev" @click.stop="prevSlide">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
    <button class="nav-btn next" @click.stop="nextSlide">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>

    <!-- Indicators -->
    <div class="indicators">
      <span
        v-for="(slide, index) in slides"
        :key="index"
        class="indicator"
        :class="{ active: index === currentIndex }"
        @click.stop="goToSlide(index)"
      ></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

interface Slide {
  id: 'ai' | 'format_factory' | 'market' | 'image_workshop';
  title: string;
  desc?: string;
  icon?: string;
  image: string;
  route: string;
}

const props = defineProps<{
  slides: Slide[];
}>();

defineEmits<{
  (e: 'navigate', route: string, id: Slide['id']): void;
}>();

const currentIndex = ref(0);
let autoPlayTimer: number | null = null;
const touchStartX = ref(0);
const touchEndX = ref(0);

const nextSlide = () => {
  currentIndex.value = (currentIndex.value + 1) % props.slides.length;
};

const prevSlide = () => {
  currentIndex.value = (currentIndex.value - 1 + props.slides.length) % props.slides.length;
};

const goToSlide = (index: number) => {
  currentIndex.value = index;
};

const startAutoPlay = () => {
  autoPlayTimer = window.setInterval(nextSlide, 5000);
};

const pauseAutoPlay = () => {
  if (autoPlayTimer) {
    clearInterval(autoPlayTimer);
    autoPlayTimer = null;
  }
};

const resumeAutoPlay = () => {
  startAutoPlay();
};

// Touch handling
const onTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.changedTouches[0].screenX;
  pauseAutoPlay();
};

const onTouchMove = (_e: TouchEvent) => {
  // Optional: Add visual feedback for drag
};

const onTouchEnd = (e: TouchEvent) => {
  touchEndX.value = e.changedTouches[0].screenX;
  handleSwipe();
  resumeAutoPlay();
};

const handleSwipe = () => {
  const threshold = 50;
  if (touchStartX.value - touchEndX.value > threshold) {
    nextSlide();
  } else if (touchEndX.value - touchStartX.value > threshold) {
    prevSlide();
  }
};

onMounted(() => {
  startAutoPlay();
});

onBeforeUnmount(() => {
  if (autoPlayTimer) clearInterval(autoPlayTimer);
});
</script>

<style scoped>
.hero-carousel {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  background: #000;
}

.carousel-track {
  display: flex;
  height: 100%;
  transition: transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.carousel-slide {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  position: relative;
  cursor: pointer;
}

.slide-image-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.slide-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
  opacity: 0.9;
}

.carousel-slide:hover .slide-image {
  transform: scale(1.05);
  opacity: 1;
}

.slide-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent 60%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 32px;
  opacity: 1;
  transition: opacity 0.3s ease;
}

.brand-text {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.slide-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slide-title {
  color: #fff;
  font-size: 32px;
  font-weight: 700;
  margin: 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  line-height: 1.1;
  font-family: var(--common-font);
}

.slide-desc {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.5;
  max-width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  font-family: var(--common-font);
}

/* Mobile Adaptation */
@media (max-width: 768px) {
  .slide-overlay {
    padding: 20px;
  }

  .brand-text {
    font-size: 16px;
  }

  .slide-title {
    font-size: 24px;
  }

  .slide-desc {
    font-size: 13px;
    -webkit-line-clamp: 3;
  }
}

/* Navigation Buttons */
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 50px;
  height: 20%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  color: rgba(255, 255, 255, 0.3);
  background: transparent;
  border: none;
  transition: all 0.3s ease;
  opacity: 0;
}

.hero-carousel:hover .nav-btn {
  opacity: 1;
}

.nav-btn svg {
  width: 48px;
  height: 48px;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.nav-btn:hover {
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.4) 0%, transparent 100%);
  color: var(--primary);
}

.nav-btn.next:hover {
  background: linear-gradient(-90deg, rgba(0, 0, 0, 0.4) 0%, transparent 100%);
}

.nav-btn:hover svg {
  transform: scale(1.2);
  filter: drop-shadow(0 0 8px var(--primary));
}

.nav-btn:active svg {
  transform: scale(0.9);
}

.prev {
  left: 0;
  justify-content: flex-start;
  padding-left: 10px;
}

.next {
  right: 0;
  justify-content: flex-end;
  padding-right: 10px;
}

/* Indicators */
.indicators {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 10;
}

.indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.3s;
}

.indicator.active {
  background: var(--primary);
  width: 24px;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .nav-btn {
    display: none;
  }

  .slide-overlay {
    opacity: 1;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent 50%);
    padding: 16px;
  }

  .slide-title {
    font-size: 18px;
    transform: none;
    margin-bottom: 4px;
  }

  .click-hint {
    display: none;
  }
}
</style>
