<template>
  <section class="section experience-section">
    <div class="content-wrapper">
      <h2 class="section-title">{{ t('experience.title') }}</h2>
      <div class="timeline">
        <div v-for="(exp, index) in experience" :key="index" class="timeline-item">
          <div class="timeline-dot-wrapper">
            <div class="timeline-dot"></div>
            <div class="timeline-dot-pulse"></div>
          </div>
          <div class="timeline-content glass-card">
            <span class="period">{{ exp.period }}</span>
            <h3 class="role">{{ exp.role }}</h3>
            <h4 class="company">{{ exp.company }}</h4>
            <div class="desc">
              <ul v-if="Array.isArray(exp.desc)" class="desc-list">
                <li v-for="(line, i) in exp.desc" :key="i">{{ line }}</li>
              </ul>
              <p v-else>{{ exp.desc }}</p>
            </div>
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

const experience = computed(() => [
  {
    period: t('experience.items.item1.period'),
    role: t('experience.items.item1.role'),
    company: t('experience.items.item1.company'),
    desc: t('experience.items.item1.desc')
  },
  {
    period: t('experience.items.item2.period'),
    role: t('experience.items.item2.role'),
    company: t('experience.items.item2.company'),
    desc: t('experience.items.item2.desc')
  },
  {
    period: t('experience.items.item3.period'),
    role: t('experience.items.item3.role'),
    company: t('experience.items.item3.company'),
    desc: t('experience.items.item3.desc')
  },
  {
    period: t('experience.items.item4.period'),
    role: t('experience.items.item4.role'),
    company: t('experience.items.item4.company'),
    desc: t('experience.items.item4.desc')
  },
  {
    period: t('experience.items.item5.period'),
    role: t('experience.items.item5.role'),
    company: t('experience.items.item5.company'),
    desc: t('experience.items.item5.desc')
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
  max-width: 1000px;
  width: 100%;
  margin: 0 auto;
}

.section-title {
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 80px;
  text-align: center;
  background: linear-gradient(to right, #fff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
  text-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
}

.timeline {
  position: relative;
  max-width: 900px;
  margin: 0 auto;
  padding-left: 20px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 39px;
  top: 0;
  width: 2px;
  height: 100%;
  background: linear-gradient(to bottom, transparent, rgba(56, 189, 248, 0.3), transparent);
}

.timeline-item {
  position: relative;
  padding-left: 80px;
  margin-bottom: 60px;
  opacity: 0;
  animation: slideIn 0.5s ease-out forwards;
}

.timeline-item:nth-child(1) {
  animation-delay: 0.1s;
}
.timeline-item:nth-child(2) {
  animation-delay: 0.3s;
}
.timeline-item:nth-child(3) {
  animation-delay: 0.5s;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.timeline-item:last-child {
  margin-bottom: 0;
}

.timeline-dot-wrapper {
  position: absolute;
  left: 30px;
  top: 30px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  background: #38bdf8;
  border-radius: 50%;
  box-shadow: 0 0 10px #38bdf8;
  z-index: 2;
}

.timeline-dot-pulse {
  position: absolute;
  width: 100%;
  height: 100%;
  background: rgba(56, 189, 248, 0.3);
  border-radius: 50%;
  animation: pulse 2s infinite;
  z-index: 1;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.5;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

.glass-card {
  background: rgba(30, 41, 59, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 24px;
  padding: 40px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.glass-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(
    800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(255, 255, 255, 0.04),
    transparent 40%
  );
  opacity: 0;
  transition: opacity 0.5s;
  pointer-events: none;
}

.timeline-item:hover .glass-card {
  transform: translateX(10px) translateY(-5px);
  background: rgba(30, 41, 59, 0.4);
  border-color: rgba(56, 189, 248, 0.3);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.timeline-item:hover .glass-card::before {
  opacity: 1;
}

.period {
  display: inline-block;
  font-size: 0.9rem;
  font-weight: 700;
  color: #38bdf8;
  margin-bottom: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  background: rgba(56, 189, 248, 0.1);
  padding: 6px 12px;
  border-radius: 100px;
}

.role {
  font-size: 1.75rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0 0 8px 0;
  letter-spacing: -0.01em;
}

.company {
  font-size: 1.2rem;
  color: #cbd5e1;
  font-weight: 500;
  margin: 0 0 20px 0;
}

.desc {
  font-size: 1.1rem;
  color: #94a3b8;
  line-height: 1.8;
  margin-top: 24px;
}

.desc-list {
  padding-left: 20px;
  margin: 0;
}

.desc-list li {
  margin-bottom: 8px;
  list-style-type: disc;
}

@media (max-width: 768px) {
  .section {
    padding: 80px 20px 40px;
  }

  .timeline::before {
    left: 19px;
  }

  .timeline-dot-wrapper {
    left: 10px;
    top: 24px;
  }

  .timeline-item {
    padding-left: 50px;
    margin-bottom: 40px;
  }

  .role {
    font-size: 1.4rem;
  }

  .glass-card {
    padding: 24px;
  }
}
</style>
