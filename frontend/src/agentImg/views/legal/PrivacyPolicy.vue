<template>
  <div class="legal-page">
    <header class="top-header">
      <div class="top-header-inner">
        <router-link to="/agentimg" class="top-logo">
          <span class="top-logo-text">Nth Me</span>
        </router-link>

        <nav class="top-nav">
          <router-link to="/agentimg/format-factory" class="top-nav-item">格式工厂</router-link>
          <router-link to="/agentimg/ai" class="top-nav-item">AI工坊</router-link>
          <router-link to="/agentimg/market" class="top-nav-item">算力商城</router-link>
        </nav>

        <div class="top-actions">
          <router-link to="/" class="top-action-link">PORTFOLIO</router-link>
        </div>
      </div>
    </header>

    <div class="legal-container">
      <header class="legal-header">
        <h1>隐私政策</h1>
        <p class="subtitle">最后更新: 2025-12-06</p>
      </header>

      <div class="legal-content">
        <section>
          <h2>1. 信息收集</h2>
          <p>
            我们仅收集提供服务所必需的最少信息。这可能包括您的账户信息（如需登录）、使用数据（如访问频率）以及您上传用于处理的图片数据。
          </p>
        </section>

        <section>
          <h2>2. 图片处理与存储</h2>
          <p>
            您上传的图片仅用于即时处理。图片会直接传输至我们的 AI 推理引擎或本地处理逻辑。对于 AI
            生成服务，原图在生成任务完成后会立即从临时存储中清除。对于本地格式转换工具，所有处理均在您的浏览器端完成，图片不会上传至服务器。
          </p>
        </section>

        <section>
          <h2>3. 数据使用</h2>
          <p>
            我们不会将您的个人数据或上传的图片用于广告投放或出售给第三方。您的数据仅用于提供和改进我们的服务。
          </p>
        </section>

        <section>
          <h2>4. Cookie 使用</h2>
          <p>
            我们使用本地存储和必要的 Cookie 来保存您的登录状态和偏好设置（如深色模式、语言选择）。
          </p>
        </section>

        <div class="contact-box">
          如有隐私相关问题，请联系: <span class="highlight">surgethisworld@gmail.com</span>
        </div>
      </div>
    </div>
    <GlobalFooter />
  </div>
</template>

<script setup lang="ts">
import GlobalFooter from '../../components/GlobalFooter.vue';
</script>

<style scoped>
/* Reuse styles from TermsOfService or extract to common css */
.legal-page {
  min-height: 100vh;
  background-color: #050505;
  color: #f1f5f9;
  font-family: 'Inter', sans-serif;
  padding-top: 120px;
}

.top-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  background: rgba(5, 5, 5, 0.7);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.top-header-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.top-logo {
  text-decoration: none;
}

.top-logo-text {
  font-weight: 900;
  font-size: 18px;
  color: #ccff00;
  letter-spacing: -0.5px;
}

.top-nav {
  display: flex;
  gap: 18px;
  align-items: center;
}

.top-nav-item {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-nav-item:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-action-link {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94a3b8;
  text-decoration: none;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 10, 10, 0.4);
  transition: all 0.2s;
}

.top-action-link:hover {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.4);
}

.legal-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 24px;
}

.legal-header {
  margin-bottom: 60px;
}

h1 {
  font-size: 48px;
  font-weight: 900;
  color: #ccff00;
  margin-bottom: 16px;
  letter-spacing: -1px;
}

.subtitle {
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
}

.legal-content section {
  margin-bottom: 40px;
}

h2 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #fff;
}

p {
  line-height: 1.8;
  color: #cbd5e1;
  font-size: 15px;
}

.contact-box {
  margin-top: 60px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  color: #94a3b8;
}

.highlight {
  color: #ccff00;
}
</style>
