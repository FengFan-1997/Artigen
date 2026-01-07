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
        <h1>服务条款</h1>
        <p class="subtitle">最后更新: 2025-12-06</p>
      </header>

      <div class="legal-content">
        <section>
          <h2>1. 服务说明</h2>
          <p>
            「Nth
            Me」（由个人开发者独立运营）是一款基于人工智能的图像生成服务。您上传照片后，我们的AI系统会根据预设的风格模板为您生成艺术化的头像图片。
          </p>
        </section>

        <section>
          <h2>2. 使用规范</h2>
          <p>
            您在使用本服务时，需确保上传的照片为您本人或已获得授权。禁止上传违法、侵权或不当内容。我们保留拒绝处理任何我们认为不适当内容的权利。
          </p>
        </section>

        <section>
          <h2>3. 付费与退款</h2>
          <p>
            本服务采用积分制，购买的积分永久有效。如需退款，请在购买后 3
            天内提出申请，且已使用积分不超过 20
            个。超出此条件的订单不支持退款。详情请参阅我们的退款政策页面。
          </p>
        </section>

        <section>
          <h2>4. 隐私保护</h2>
          <p>
            我们重视您的隐私。本服务不存储您上传的照片，图片直接传输至处理引擎。处理完成后即时返回结果。我们的服务器不保留任何图片数据。
          </p>
        </section>

        <section>
          <h2>5. 知识产权</h2>
          <p>
            生成的图片归您所有，您可以自由使用。但本服务的技术、界面设计、风格模板等知识产权归「Nth
            Me」所有。
          </p>
        </section>

        <section>
          <h2>6. 免责声明</h2>
          <p>
            本服务按“现状”提供。我们要不对AI生成结果的准确性、适用性做任何保证。因使用本服务产生的任何直接或间接损失，我们不承担责任。
          </p>
        </section>

        <div class="contact-box">
          如有疑问，请联系: <span class="highlight">surgethisworld@gmail.com</span>
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
