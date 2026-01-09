<template>
  <div class="legal-page">
    <header class="top-header">
      <div class="top-header-inner">
        <router-link to="/artigen" class="top-logo">
          <span class="top-logo-text">Artigen</span>
        </router-link>

        <nav class="top-nav">
          <router-link to="/artigen/format-factory" class="top-nav-item">格式工厂</router-link>
          <router-link to="/artigen/ai" class="top-nav-item">AI工坊</router-link>
          <router-link to="/artigen/market" class="top-nav-item">算力商城</router-link>
        </nav>

        <div class="top-actions">
          <router-link to="/" class="top-action-link">PORTFOLIO</router-link>
        </div>
      </div>
    </header>

    <div class="legal-container">
      <header class="legal-header">
        <h1>退款政策</h1>
        <p class="subtitle">最后更新: 2025-12-30</p>
      </header>

      <div class="legal-content">
        <p class="intro">
          在「Artigen」，我们致力于提供透明、公平的退款体验。请在购买前仔细阅读本政策。
        </p>

        <section>
          <h2>14 天无理由退款</h2>
          <p>我们提供购买后 14 天内的全额退款，前提是积分尚未被使用。</p>
        </section>

        <section>
          <h2>如何申请退款</h2>
          <p>
            如果您在 14 天内且未使用已购积分，请发送邮件至 sorates1997@163.com
            并附上您的订单号。我们将通过原支付方式处理退款。
          </p>
        </section>

        <section>
          <h2>例外情况</h2>
          <p>
            如果您已使用购买的任何积分，我们保留拒绝退款请求或酌情提供部分退款的权利。超过 14
            天后，所有销售均为最终销售。
          </p>
        </section>

        <div class="contact-box">
          如有疑问，请联系: <span class="highlight">sorates1997@163.com</span>
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

.intro {
  margin-bottom: 40px;
  font-size: 16px;
  color: #fff;
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
