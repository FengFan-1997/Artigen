<template>
  <section class="section about-section" id="about">
    <div class="content-wrapper">
      <h2 class="section-title">{{ t('about.title') }}</h2>
      <div class="about-content">
        <div class="about-text">
          <p class="bio">
            {{ t('about.bio') }}
          </p>

          <div class="tech-stack">
            <div class="stack-category">
              <h3>{{ t('about.proficient') }}</h3>
              <p>{{ t('about.stack1') }}</p>
            </div>
            <div class="stack-category">
              <h3>{{ t('about.familiar') }}</h3>
              <p>{{ t('about.stack2') }}</p>
            </div>
          </div>

          <div class="education-honors">
            <div class="info-block">
              <h3>{{ t('about.education.title') }}</h3>
              <p class="school">
                <strong>{{ t('about.education.school') }}</strong>
              </p>
              <p>{{ t('about.education.degree') }}</p>
              <p class="sub-text">{{ t('about.education.period') }}</p>
              <p class="sub-text course-text">{{ t('about.education.courses') }}</p>
            </div>
            <div class="info-block">
              <h3>{{ t('about.honors.title') }}</h3>
              <ul class="honor-list">
                <li v-for="(honor, i) in t('about.honors.list')" :key="i">{{ honor }}</li>
              </ul>
            </div>
          </div>

          <div class="philosophy glass-panel">
            <p>{{ t('about.philosophy') }}</p>
          </div>
        </div>
        <div class="stats-grid">
          <div class="stat-item glass-card">
            <span class="stat-number">3+</span>
            <span class="stat-label">{{ t('about.stats.years') }}</span>
          </div>
          <div class="stat-item glass-card">
            <span class="stat-number">30+</span>
            <span class="stat-label">{{ t('about.stats.projects') }}</span>
          </div>
          <div class="stat-item glass-card">
            <span class="stat-number">10+</span>
            <span class="stat-label">{{ t('about.stats.awards') }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useLanguageStore } from '../stores/language';
const { t } = useLanguageStore();
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
  margin-bottom: 80px;
  text-align: center;
  background: linear-gradient(to right, #fff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
  text-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
}

.about-section {
  background: linear-gradient(to bottom, transparent, rgba(15, 23, 42, 0.5));
}

.about-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;
}

.bio {
  font-size: 1.25rem;
  line-height: 1.8;
  color: #e2e8f0;
  margin-bottom: 40px;
}

.tech-stack {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  margin-bottom: 40px;
}

.stack-category h3 {
  font-size: 1.1rem;
  color: #38bdf8;
  margin-bottom: 12px;
}

.stack-category p {
  color: #94a3b8;
  line-height: 1.6;
}

.education-honors {
  display: grid;
  grid-template-columns: 1fr;
  gap: 30px;
  margin-bottom: 40px;
}

.info-block h3 {
  font-size: 1.1rem;
  color: #38bdf8;
  margin-bottom: 12px;
}

.info-block p {
  color: #cbd5e1;
  margin-bottom: 4px;
}

.info-block .sub-text {
  font-size: 0.9rem;
  color: #94a3b8;
}

.info-block .course-text {
  font-style: italic;
  margin-top: 8px;
  line-height: 1.5;
}

.honor-list {
  padding-left: 20px;
  margin: 0;
  color: #cbd5e1;
}

.honor-list li {
  margin-bottom: 8px;
  list-style-type: disc;
}

.glass-panel {
  padding: 30px;
  background: rgba(30, 41, 59, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-left: 4px solid #38bdf8;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
}

.philosophy p {
  color: #cbd5e1;
  font-style: italic;
  font-size: 1.1rem;
  margin: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 30px;
}

.glass-card {
  background: rgba(30, 41, 59, 0.3);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  padding: 40px;
  border-radius: 24px;
  text-align: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(255, 255, 255, 0.05);
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
    400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(255, 255, 255, 0.04),
    transparent 40%
  );
  opacity: 0;
  transition: opacity 0.5s;
  pointer-events: none;
}

.glass-card:hover {
  transform: translateY(-10px);
  background: rgba(30, 41, 59, 0.4);
  border-color: rgba(56, 189, 248, 0.3);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.glass-card:hover::before {
  opacity: 1;
}

.stat-number {
  display: block;
  font-size: 3.5rem;
  font-weight: 800;
  color: #38bdf8;
  margin-bottom: 8px;
  font-family: 'Space Mono', monospace;
  text-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
}

.stat-label {
  color: #94a3b8;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
}

@media (max-width: 900px) {
  .about-content {
    grid-template-columns: 1fr;
    gap: 60px;
  }

  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 600px) {
  .tech-stack {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .section-title {
    font-size: 2.5rem;
  }
}
</style>
