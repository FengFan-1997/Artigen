<template>
  <div class="market-page">
    <header class="top-header">
      <div class="top-header-inner">
        <router-link to="/agentimg" class="top-logo">
          <span class="top-logo-text">Nth Me</span>
        </router-link>

        <nav class="top-nav">
          <router-link to="/agentimg/format-factory" class="top-nav-item">格式工厂</router-link>
          <router-link to="/agentimg/ai" class="top-nav-item">AI工坊</router-link>
          <router-link to="/agentimg/market" class="top-nav-item active">算力商城</router-link>
        </nav>

        <div class="top-actions">
          <router-link to="/" class="top-action-link">PORTFOLIO</router-link>
        </div>
      </div>
    </header>

    <div class="market-container">
      <header class="market-header">
        <h1 class="title">购买 算力 <span class="bolt">⚡</span></h1>
        <p class="subtitle">// 选择适合你的算力包</p>
        <div class="nav-btn"><span class="dot">●</span> 算力商城</div>
      </header>

      <div class="currency-toggle">
        <div class="toggle-bg">
          <button
            class="toggle-btn"
            :class="{ active: currency === 'USD' }"
            @click="currency = 'USD'"
          >
            US USD
          </button>
          <button
            class="toggle-btn"
            :class="{ active: currency === 'CNY' }"
            @click="currency = 'CNY'"
          >
            CN CNY
          </button>
        </div>
      </div>

      <div class="pricing-grid">
        <!-- Starter Pack -->
        <div class="pricing-card">
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="icon-box">
              <span class="icon">⚛️</span>
            </div>
            <h2>入门包</h2>
            <p class="pack-en">Starter Pack</p>
            <div class="badge standard">👤 STANDARD</div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(9.9) }}</span>
            </div>
            <div class="compute-amount">⚡ 120 算力</div>
          </div>

          <ul class="features">
            <li><span class="check">✓</span> 24 次生成 (Standard 模型)</li>
            <li><span class="check">✓</span> 支持所有基础风格</li>
            <li class="disabled"><span class="cross">✗</span> Pro 模型不可用</li>
          </ul>

          <button class="buy-btn">立即购买</button>
        </div>

        <!-- Standard Pack -->
        <div class="pricing-card">
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="icon-box">
              <span class="icon">⚡</span>
            </div>
            <h2>标准包</h2>
            <p class="pack-en">Standard Pack</p>
            <div class="badge standard">👤 STANDARD</div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(79.0) }}</span>
            </div>
            <div class="compute-amount">⚡ 1,000 算力</div>
          </div>

          <ul class="features">
            <li><span class="check">✓</span> 30 次 Standard + 30 次 Pro</li>
            <li><span class="check">✓</span> 解锁 Pro 高清模型</li>
            <li><span class="check">✓</span> 支持所有风格</li>
          </ul>

          <button class="buy-btn">立即购买</button>
        </div>

        <!-- Professional Pack (Green Theme) -->
        <div class="pricing-card pro-theme">
          <div class="tag-recommend">✨ 推荐</div>
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="icon-box">
              <span class="icon">✨</span>
            </div>
            <h2>专业包</h2>
            <p class="pack-en">Pro Pack</p>
            <div class="badge pro">🔒 PRO ACCESS</div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(159.0) }}</span>
            </div>
            <div class="compute-amount">⚡ 2,400 算力</div>
          </div>

          <ul class="features">
            <li><span class="check">✓</span> 100 次 Standard + 50 次 Pro</li>
            <li><span class="check">✓</span> Pro 高清模型 (4K 输出)</li>
            <li><span class="check">✓</span> 优先处理队列</li>
            <li><span class="check">✓</span> 加入用户社群</li>
          </ul>

          <button class="buy-btn primary">立即购买</button>
        </div>

        <!-- Ultimate Pack (Gold Theme) -->
        <div class="pricing-card ultimate-theme">
          <div class="tag-recommend gold">👑 旗舰版</div>
          <div class="card-corner top-left"></div>
          <div class="card-corner top-right"></div>
          <div class="card-corner bottom-left"></div>
          <div class="card-corner bottom-right"></div>

          <div class="card-header">
            <div class="icon-box">
              <span class="icon">👑</span>
            </div>
            <h2>旗舰包</h2>
            <p class="pack-en">Ultimate Pack</p>
            <div class="badge ultimate">🔒 PRO ACCESS</div>
          </div>

          <div class="price-section">
            <div class="price">
              <span class="symbol">{{ currencySymbol }}</span>
              <span class="amount">{{ getPrice(399.0) }}</span>
            </div>
            <div class="compute-amount">⚡ 6,500 算力</div>
          </div>

          <ul class="features">
            <li><span class="check">✓</span> 200 次 Standard + 200 次 Pro</li>
            <li><span class="check">✓</span> 终身 VIP 标识</li>
            <li><span class="check">✓</span> 提前体验新工具</li>
            <li><span class="check">✓</span> 加入核心用户群</li>
          </ul>

          <button class="buy-btn gold">🔥 立即激活</button>
        </div>
      </div>
    </div>
    <GlobalFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import GlobalFooter from '../components/GlobalFooter.vue';

const currency = ref<'CNY' | 'USD'>('CNY');

const currencySymbol = computed(() => (currency.value === 'CNY' ? '¥' : '$'));
const exchangeRate = 0.14; // Approximate CNY to USD rate

const getPrice = (cnyPrice: number) => {
  if (currency.value === 'CNY') {
    return cnyPrice.toFixed(2);
  } else {
    return (cnyPrice * exchangeRate).toFixed(2);
  }
};
</script>

<style scoped>
@import '../styles/cyberpunk.css';

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

.top-nav-item.active {
  color: #ccff00;
  border-color: rgba(204, 255, 0, 0.6);
  box-shadow: 0 0 18px rgba(204, 255, 0, 0.15);
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

.market-page {
  min-height: 100vh;
  background-color: #050505;
  color: #fff;
  font-family: 'Inter', sans-serif;
  padding-top: 120px;
  background-image:
    linear-gradient(rgba(204, 255, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(204, 255, 0, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
}

.market-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.market-header {
  text-align: center;
  margin-bottom: 60px;
}

.title {
  font-size: 48px;
  font-weight: 900;
  margin-bottom: 12px;
  letter-spacing: -1px;
}

.bolt {
  color: #ffd700;
  display: inline-block;
  animation: pulse 2s infinite;
}

.subtitle {
  color: #64748b;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  margin-bottom: 24px;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  color: #ccff00;
  border: 1px solid rgba(204, 255, 0, 0.2);
}

.dot {
  font-size: 12px;
}

/* Currency Toggle */
.currency-toggle {
  display: flex;
  justify-content: center;
  margin-bottom: 60px;
}

.toggle-bg {
  background: #1e1e1e;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  gap: 4px;
  border: 1px solid #333;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: #666;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s ease;
}

.toggle-btn.active {
  background: #ccff00;
  color: #000;
  box-shadow: 0 2px 10px rgba(204, 255, 0, 0.2);
}

/* Pricing Grid */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  margin-bottom: 80px;
}

.pricing-card {
  position: relative;
  background: rgba(10, 10, 10, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 32px 24px;
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s;
  cursor: pointer;
}

.pricing-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  border-color: rgba(204, 255, 0, 0.3);
}

.pricing-card:active {
  transform: translateY(-2px) scale(0.99);
}

/* Card Corners */
.card-corner {
  position: absolute;
  width: 8px;
  height: 8px;
  border: 1px solid transparent;
  transition: all 0.3s ease;
}

.pricing-card:hover .card-corner {
  border-color: #666;
}

.top-left {
  top: -1px;
  left: -1px;
  border-top: 2px solid #333;
  border-left: 2px solid #333;
}
.top-right {
  top: -1px;
  right: -1px;
  border-top: 2px solid #333;
  border-right: 2px solid #333;
}
.bottom-left {
  bottom: -1px;
  left: -1px;
  border-bottom: 2px solid #333;
  border-left: 2px solid #333;
}
.bottom-right {
  bottom: -1px;
  right: -1px;
  border-bottom: 2px solid #333;
  border-right: 2px solid #333;
}

/* Card Content */
.card-header {
  margin-bottom: 24px;
}

.icon-box {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.icon {
  font-size: 24px;
}

.pricing-card h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
  color: #fff;
}

.pack-en {
  color: #64748b;
  font-size: 14px;
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 12px;
}

.badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.badge.standard {
  background: #333;
  color: #ccc;
  border: 1px solid #444;
}

.badge.pro {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.badge.ultimate {
  background: rgba(255, 215, 0, 0.1);
  color: #ffd700;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

/* Price Section */
.price-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.price {
  font-size: 32px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.price .symbol {
  font-size: 20px;
  color: #64748b;
}

.compute-amount {
  color: #ccff00;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
}

/* Features */
.features {
  list-style: none;
  padding: 0;
  margin: 0 0 32px 0;
}

.features li {
  font-size: 14px;
  color: #94a3b8;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  line-height: 1.5;
}

.check {
  color: #64748b;
}

.cross {
  color: #444;
}

.features li.disabled {
  color: #475569;
  text-decoration: line-through;
}

/* Buttons */
.buy-btn {
  width: 100%;
  padding: 14px;
  background: transparent;
  border: 1px solid #444;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: 'Inter', sans-serif;
}

.buy-btn:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

/* Pro Theme Overrides */
.pro-theme:hover {
  border-color: #10b981;
  box-shadow: 0 20px 40px rgba(16, 185, 129, 0.1);
}

.pro-theme .icon-box {
  color: #10b981;
}

.pro-theme .compute-amount {
  color: #10b981;
}

.pro-theme .buy-btn.primary {
  background: #064e3b;
  border-color: #064e3b;
  color: #10b981;
}

.pro-theme .buy-btn.primary:hover {
  background: #10b981;
  color: #000;
}

/* Ultimate Theme Overrides */
.ultimate-theme {
  border-color: rgba(255, 215, 0, 0.3);
}

.ultimate-theme:hover {
  border-color: #ffd700;
  box-shadow: 0 20px 40px rgba(255, 215, 0, 0.1);
}

.ultimate-theme .icon-box {
  color: #ffd700;
}

.ultimate-theme .compute-amount {
  color: #ffd700;
}

.ultimate-theme .buy-btn.gold {
  background: #ffd700;
  border-color: #ffd700;
  color: #000;
}

.ultimate-theme .buy-btn.gold:hover {
  background: #ffe44d;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
}

/* Recommended Tags */
.tag-recommend {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: #064e3b;
  color: #10b981;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid #10b981;
}

.tag-recommend.gold {
  background: #713f12;
  color: #ffd700;
  border-color: #ffd700;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .pricing-grid {
    grid-template-columns: 1fr;
  }
}
</style>
