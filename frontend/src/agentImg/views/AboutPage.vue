<template>
  <div class="about-page">
    <div class="content-wrapper">
      <TitleBar />

      <main class="about-main">
        <section class="hero-section">
          <h1 class="page-title">{{ t.title }}</h1>
          <p class="page-desc">{{ t.description }}</p>
        </section>

        <section class="team-section">
          <h2 class="section-title">{{ t.teamTitle }}</h2>
          <div class="team-grid">
            <div v-for="member in teamMembers" :key="member.name" class="team-card">
              <div class="member-avatar">{{ member.initial }}</div>
              <h3 class="member-name">{{ member.name }}</h3>
              <p class="member-role">{{ member.role }}</p>
            </div>
          </div>
        </section>

        <section class="investors-section">
          <h2 class="section-title">{{ t.investorsTitle }}</h2>
          <div class="investors-grid">
            <div v-for="investor in investors" :key="investor.name" class="investor-card">
              <div class="investor-logo-placeholder">{{ investor.initial }}</div>
              <h3 class="investor-name">{{ investor.name }}</h3>
            </div>
          </div>
        </section>

        <section class="contact-section">
          <h2 class="section-title">{{ t.contactTitle }}</h2>
          <div class="contact-content">
            <p class="contact-text">{{ t.contactText }}</p>
            <a href="mailto:support@artigen.ai" class="contact-email">support@artigen.ai</a>

            <div class="social-links">
              <a href="#" class="social-link">Twitter</a>
              <a href="#" class="social-link">Discord</a>
              <a href="#" class="social-link">GitHub</a>
            </div>
          </div>
        </section>
      </main>

      <GlobalFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import TitleBar from '../components/TitleBar.vue';
import GlobalFooter from '../components/GlobalFooter.vue';
import { useLanguageStore } from '@/stores/language';

const languageStore = useLanguageStore();
const { currentLang } = storeToRefs(languageStore);

const t = computed(() => {
  if (currentLang.value === 'zh') {
    return {
      title: '关于 Artigen',
      description:
        '我们致力于让每个人都能通过 AI 释放创造力。Artigen 结合了前沿的生成式 AI 技术与便捷的本地工具，为您提供安全、高效的创作体验。',
      teamTitle: '团队成员',
      investorsTitle: '投资人',
      contactTitle: '联系我们',
      contactText: '有任何问题或建议？欢迎随时联系我们。'
    };
  }
  return {
    title: 'About Artigen',
    description:
      'We are dedicated to empowering everyone to unleash their creativity through AI. Artigen combines cutting-edge generative AI with convenient local tools to provide a secure and efficient creative experience.',
    teamTitle: 'Our Team',
    investorsTitle: 'Investors',
    contactTitle: 'Contact Us',
    contactText: 'Have questions or suggestions? Feel free to reach out.'
  };
});

const teamMembers = [
  { name: 'Alex Chen', role: 'Founder & CEO', initial: 'AC' },
  { name: 'Sarah Wu', role: 'CTO', initial: 'SW' },
  { name: 'David Li', role: 'Head of Design', initial: 'DL' },
  { name: 'Emily Zhang', role: 'Lead Engineer', initial: 'EZ' },
  { name: 'Michael Wang', role: 'AI Researcher', initial: 'MW' },
  { name: 'Jessica Liu', role: 'Product Manager', initial: 'JL' }
];

const investors = [
  { name: 'Sequoia Capital', initial: 'SC' },
  { name: 'Y Combinator', initial: 'YC' },
  { name: 'Andreessen Horowitz', initial: 'A16Z' },
  { name: 'Lightspeed', initial: 'LS' }
];
</script>

<style scoped>
.about-page {
  min-height: 100vh;
  background-color: #050505;
  color: #e2e8f0;
  font-family: var(
    --common-font,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif
  );
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.about-main {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 120px 24px 80px;
  box-sizing: border-box;
}

.hero-section {
  text-align: center;
  margin-bottom: 80px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.page-title {
  font-size: 48px;
  font-weight: 800;
  margin-bottom: 24px;
  background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -1px;
}

.page-desc {
  font-size: 18px;
  line-height: 1.6;
  color: #94a3b8;
}

.section-title {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 40px;
  text-align: center;
  color: #f1f5f9;
}

/* Team Grid */
.team-section {
  margin-bottom: 80px;
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 32px;
}

.team-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  transition:
    transform 0.2s,
    background 0.2s;
}

.team-card:hover {
  transform: translateY(-5px);
  background: rgba(255, 255, 255, 0.05);
}

.member-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: white;
}

.member-name {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px;
  color: #f8fafc;
}

.member-role {
  font-size: 14px;
  color: #94a3b8;
  margin: 0;
}

/* Investors Grid */
.investors-section {
  margin-bottom: 80px;
}

.investors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 24px;
}

.investor-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 40px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.investor-card:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.04);
}

.investor-logo-placeholder {
  font-size: 24px;
  font-weight: 800;
  color: #64748b;
  margin-bottom: 16px;
  letter-spacing: 2px;
}

.investor-name {
  font-size: 16px;
  font-weight: 500;
  color: #cbd5e1;
  margin: 0;
}

/* Contact Section */
.contact-section {
  text-align: center;
  padding: 60px 24px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.contact-content {
  max-width: 600px;
  margin: 0 auto;
}

.contact-text {
  font-size: 16px;
  color: #94a3b8;
  margin-bottom: 24px;
}

.contact-email {
  display: inline-block;
  font-size: 24px;
  font-weight: 700;
  color: #ccff00; /* Artigen Primary */
  text-decoration: none;
  margin-bottom: 40px;
  transition: opacity 0.2s;
}

.contact-email:hover {
  opacity: 0.8;
}

.social-links {
  display: flex;
  justify-content: center;
  gap: 32px;
}

.social-link {
  color: #cbd5e1;
  text-decoration: none;
  font-size: 16px;
  font-weight: 500;
  transition: color 0.2s;
}

.social-link:hover {
  color: #fff;
}

@media (max-width: 768px) {
  .page-title {
    font-size: 36px;
  }

  .team-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .investors-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .team-grid {
    grid-template-columns: 1fr;
  }

  .investors-grid {
    grid-template-columns: 1fr;
  }

  .social-links {
    flex-direction: column;
    gap: 16px;
  }
}
</style>
