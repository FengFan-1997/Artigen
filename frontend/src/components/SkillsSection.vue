<template>
  <section class="section skills-section">
    <div class="content-wrapper">
      <h2 class="section-title">{{ t('skills.title') }}</h2>

      <div class="glass-card">
        <div class="skills-grid">
          <div
            v-for="skill in skills.core"
            :key="skill.name"
            class="skill-circle"
            :style="{ '--percent': skill.percent }"
          >
            <svg viewBox="0 0 36 36" class="circular-chart">
              <defs>
                <linearGradient
                  :id="'gradient-' + sanitizeId(skill.name)"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" style="stop-color: #38bdf8" />
                  <stop offset="100%" style="stop-color: #818cf8" />
                </linearGradient>
                <filter
                  :id="'glow-' + sanitizeId(skill.name)"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path
                class="circle-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                class="circle"
                :stroke="'url(#gradient-' + sanitizeId(skill.name) + ')'"
                :filter="'url(#glow-' + sanitizeId(skill.name) + ')'"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div class="skill-info">
              <span class="percent">{{ skill.percent }}%</span>
              <span class="name">{{ skill.name }}</span>
            </div>
          </div>
        </div>

        <div class="skills-divider"></div>

        <div class="skills-tags">
          <span v-for="tech in skills.stack" :key="tech" class="tech-tag">{{ tech }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useLanguageStore } from '../stores/language';
const { t } = useLanguageStore();
const skills = {
  core: [
    { name: 'Vue 3 / Nuxt', percent: 95 },
    { name: 'TypeScript', percent: 90 },
    { name: 'Three.js / WebGL', percent: 85 },
    { name: 'Node.js', percent: 80 }
  ],
  stack: [
    'Vite',
    'Pinia',
    'GSAP',
    'Tailwind',
    'Python',
    'Docker',
    'AWS',
    'Figma',
    'React',
    'Next.js',
    'CI/CD'
  ]
};

const sanitizeId = (name: string) => {
  return name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
};
</script>

<style scoped>
.section {
  min-height: 100vh;
  width: 100%;
  max-width: 1400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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

.glass-card {
  background: rgba(30, 41, 59, 0.3);
  /* backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px); */
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 32px;
  padding: 60px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.skills-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 40px;
  margin-bottom: 60px;
}

.skill-circle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  position: relative;
  transition: transform 0.3s ease;
}

.skill-circle:hover {
  transform: translateY(-10px);
}

.circular-chart {
  width: 160px;
  height: 160px;
  overflow: visible;
}

.circle-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.05);
  stroke-width: 1.5;
}

.circle {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: var(--percent), 100;
  transition: all 1s ease-out;
}

.skill-circle:hover .circle {
  animation: progress 1.5s ease-out forwards;
}

@keyframes progress {
  0% {
    stroke-dasharray: 0, 100;
  }
  100% {
    stroke-dasharray: var(--percent), 100;
  }
}

.skill-info {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.skill-info .percent {
  font-size: 2rem;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

.skill-info .name {
  position: absolute;
  bottom: -40px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #e2e8f0;
  text-align: center;
  width: 150%;
  letter-spacing: 0.05em;
}

.skills-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.1), transparent);
  margin: 40px 0;
}

.skills-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.tech-tag {
  padding: 12px 28px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 100px;
  color: #cbd5e1;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: default;
}

.tech-tag:hover {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.5);
  color: #38bdf8;
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(56, 189, 248, 0.1);
}

@media (max-width: 900px) {
  .skills-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 60px 30px;
  }

  .glass-card {
    padding: 30px;
  }

  .circular-chart {
    width: 120px;
    height: 120px;
  }

  .skill-info .percent {
    font-size: 1.5rem;
  }
}

@media (max-width: 600px) {
  .skills-grid {
    grid-template-columns: 1fr;
    gap: 50px;
  }

  .section-title {
    font-size: 2.5rem;
  }
}
</style>
