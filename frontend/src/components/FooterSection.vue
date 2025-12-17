<template>
  <section class="section footer-section">
    <div class="footer-content">
      <h2>Let's Create Together</h2>
      <p>Open for collaborations and new challenges.</p>
      <div class="social-links">
        <a href="#" class="social-link">GitHub</a>
        <a href="#" class="social-link">Twitter</a>
        <a href="#" class="social-link">Email</a>
      </div>
      <div class="copyright">© 2024 NEBULA.DESIGN</div>
    </div>
  </section>
</template>

<script setup lang="ts"></script>

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

/* Footer */
.footer-section {
  min-height: 50vh;
  background: linear-gradient(to top, #000, transparent);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.footer-content {
  text-align: center;
  margin-top: auto;
  margin-bottom: auto;
}

.footer-content h2 {
  font-size: 3rem;
  margin-bottom: 20px;
  background: linear-gradient(to right, #fff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.footer-content p {
  color: #64748b;
  margin-bottom: 60px;
  font-size: 1.2rem;
}

.social-links {
  display: flex;
  gap: 40px;
  justify-content: center;
  margin-bottom: 80px;
}

.social-link {
  color: #cbd5e1;
  text-decoration: none;
  font-size: 1.1rem;
  position: relative;
  transition: color 0.3s;
}

.social-link:hover {
  color: #38bdf8;
}

.social-link::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 0;
  width: 0;
  height: 1px;
  background: #38bdf8;
  transition: width 0.3s;
}

.social-link:hover::after {
  width: 100%;
}

.copyright {
  font-size: 0.9rem;
  color: #475569;
}

@media (max-width: 768px) {
  .section {
    padding: 80px 20px 40px;
  }

  .footer-content h2 {
    font-size: 2rem;
  }

  .social-links {
    gap: 20px;
    margin-bottom: 40px;
  }
}
</style>
