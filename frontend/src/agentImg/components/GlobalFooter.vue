<template>
  <footer class="global-footer">
    <div class="footer-content">
      <div class="footer-left">
        <div class="footer-logo">Nth Me</div>
        <div class="copyright">© 2026 无限图界 - 聚合 N 种黑科技</div>
      </div>

      <div class="footer-links">
        <router-link to="/agentimg/legal/terms">服务条款</router-link>
        <router-link to="/agentimg/legal/privacy">隐私政策</router-link>
        <router-link to="/agentimg/legal/refund">退款政策</router-link>
        <a href="mailto:surgethisworld@gmail.com">联系我们</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.global-footer {
  width: 100%;
  padding: 40px 60px;
  background: #050505;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-family: 'JetBrains Mono', monospace;
}

.footer-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-logo {
  font-family: 'Inter', sans-serif;
  font-weight: 900;
  font-size: 18px;
  color: #ccff00;
  margin-bottom: 8px;
}

.copyright {
  font-size: 12px;
  color: #64748b;
}

.footer-links {
  display: flex;
  gap: 32px;
}

.footer-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 12px;
  transition: all 0.2s;
  position: relative;
  padding-bottom: 2px;
}

.footer-links a::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 1px;
  background-color: #ccff00;
  transition: width 0.3s ease;
}

.footer-links a:hover {
  color: #ccff00;
}

.footer-links a:hover::after {
  width: 100%;
}

@media (max-width: 768px) {
  .footer-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 24px;
  }

  .footer-links {
    flex-wrap: wrap;
    gap: 20px;
  }
}
</style>
