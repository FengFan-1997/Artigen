<template>
  <section class="section testimonials-section">
    <div class="content-wrapper">
      <h2 class="section-title">{{ t('testimonials.title') }}</h2>
      <div class="testimonials-grid">
        <div v-for="(item, index) in testimonials" :key="index" class="testimonial-card">
          <div class="quote-icon">"</div>
          <p class="quote-text">{{ item.text }}</p>
          <div class="quote-author">
            <span class="author-name">{{ item.author }}</span>
            <span class="author-role">{{ item.role }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLanguageStore } from '../stores/language';
const { t } = useLanguageStore();

const testimonials = computed(() => [
  {
    text: t('testimonials.items.item1.text'),
    author: t('testimonials.items.item1.author'),
    role: t('testimonials.items.item1.role')
  },
  {
    text: t('testimonials.items.item2.text'),
    author: t('testimonials.items.item2.author'),
    role: t('testimonials.items.item2.role')
  },
  {
    text: t('testimonials.items.item3.text'),
    author: t('testimonials.items.item3.author'),
    role: t('testimonials.items.item3.role')
  }
]);
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
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 60px;
  text-align: center;
  background: linear-gradient(to right, #fff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
  text-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
}

.testimonials-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 30px;
}

.testimonial-card {
  background: rgba(30, 41, 59, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 40px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
  transition: all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}

.testimonial-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(
    400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(255, 255, 255, 0.04),
    transparent 40%
  );
  opacity: 0;
  transition: opacity 0.5s;
  pointer-events: none;
}

.testimonial-card:hover::before {
  opacity: 1;
}

.testimonial-card:hover {
  background: rgba(30, 41, 59, 0.5);
  border-color: rgba(56, 189, 248, 0.3);
  transform: translateY(-10px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.quote-icon {
  font-size: 4rem;
  color: #38bdf8;
  opacity: 0.3;
  font-family: serif;
  line-height: 1;
  margin-bottom: 20px;
  text-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
}

.quote-text {
  font-size: 1.1rem;
  line-height: 1.6;
  color: #e2e8f0;
  margin-bottom: 30px;
  font-style: italic;
  position: relative;
  z-index: 1;
}

.quote-author {
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

.author-name {
  font-weight: 700;
  color: #fff;
  font-size: 1.1rem;
  letter-spacing: 0.02em;
}

.author-role {
  font-size: 0.9rem;
  color: #94a3b8;
  margin-top: 4px;
}

@media (max-width: 900px) {
  .testimonials-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .testimonials-grid {
    grid-template-columns: 1fr;
    gap: 30px;
  }

  .section-title {
    font-size: 2.5rem;
  }

  .testimonial-card {
    padding: 30px;
  }
}
</style>
