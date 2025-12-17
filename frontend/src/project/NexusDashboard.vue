<template>
  <div class="nexus-dashboard">
    <!-- Ambient Background -->
    <div class="ambient-bg"></div>
    <div class="noise-overlay"></div>

    <div class="sidebar glass-panel">
      <div class="logo">
        <div class="logo-icon">N</div>
        <span>NEXUS <span class="ai-badge">AI</span></span>
      </div>
      <nav>
        <div
          class="nav-item"
          :class="{ active: activeTab === 'dashboard' }"
          @click="activeTab = 'dashboard'"
        >
          <span class="icon">📊</span>
          <span class="label">Dashboard</span>
          <div class="active-indicator" v-if="activeTab === 'dashboard'"></div>
        </div>
        <div
          class="nav-item"
          :class="{ active: activeTab === 'prediction' }"
          @click="activeTab = 'prediction'"
        >
          <span class="icon">🧠</span>
          <span class="label">AI Prediction</span>
          <div class="active-indicator" v-if="activeTab === 'prediction'"></div>
        </div>
        <div class="nav-item" :class="{ active: activeTab === 'hft' }" @click="activeTab = 'hft'">
          <span class="icon">⚡</span>
          <span class="label">HFT Status</span>
          <div class="active-indicator" v-if="activeTab === 'hft'"></div>
        </div>
        <div class="nav-item" @click="showSettings = true">
          <span class="icon">⚙️</span>
          <span class="label">Settings</span>
        </div>
      </nav>

      <div class="sidebar-footer">
        <button class="back-home-btn" @click="goBack">
          <span class="icon">←</span> EXIT SYSTEM
        </button>
        <div class="system-status">
          <div class="status-row">
            <span>Latency</span>
            <span class="value success">{{ latency }}ms</span>
          </div>
          <div class="status-row">
            <span>AI Model</span>
            <span class="value">v4.2.0</span>
          </div>
        </div>
      </div>
    </div>

    <div class="main-content">
      <header>
        <div class="header-left">
          <button class="mobile-back-btn" @click="goBack">←</button>
          <div class="title-container">
            <h1>{{ pageTitle }}</h1>
            <span class="subtitle">Real-time Market Intelligence</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="action-btn" @click="runAnalysis" :disabled="isAnalyzing">
            <span v-if="!isAnalyzing" class="btn-content"
              ><span class="icon">🔍</span> Run AI Scan</span
            >
            <span v-else class="btn-content"><span class="loader"></span> Scanning...</span>
          </button>
          <div class="live-indicator"><span class="dot"></span> LIVE</div>
        </div>
      </header>

      <!-- Dashboard View -->
      <transition name="fade" mode="out-in">
        <div v-if="activeTab === 'dashboard'" class="dashboard-grid">
          <!-- Main Chart Area -->
          <div class="card chart-card glass-panel">
            <div class="card-header">
              <div class="header-title">
                <h3>BTC/USD Sentiment</h3>
                <span class="tag">Real-time</span>
              </div>
              <div class="confidence">
                AI Confidence: <span class="highlight">{{ confidence }}%</span>
              </div>
            </div>
            <div class="chart-visual">
              <!-- Dynamic Candlestick Chart -->
              <svg viewBox="0 0 800 300" class="line-chart">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(56, 189, 248, 0.5)" />
                    <stop offset="100%" stop-color="rgba(56, 189, 248, 0)" />
                  </linearGradient>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <!-- Grid Lines -->
                <g class="grid-lines">
                  <line x1="0" y1="75" x2="800" y2="75" stroke="rgba(255,255,255,0.05)" />
                  <line x1="0" y1="150" x2="800" y2="150" stroke="rgba(255,255,255,0.05)" />
                  <line x1="0" y1="225" x2="800" y2="225" stroke="rgba(255,255,255,0.05)" />
                </g>
                <!-- Candlesticks -->
                <g class="candlesticks">
                  <g v-for="(candle, i) in candlesticks" :key="i" class="candle-group">
                    <line
                      :x1="candle.x"
                      :y1="candle.highY"
                      :x2="candle.x"
                      :y2="candle.lowY"
                      :stroke="candle.isUp ? '#4ade80' : '#ef4444'"
                      stroke-width="1"
                      opacity="0.8"
                    />
                    <rect
                      :x="candle.x - 3"
                      :y="Math.min(candle.openY, candle.closeY)"
                      :width="6"
                      :height="Math.abs(candle.closeY - candle.openY) || 1"
                      :fill="candle.isUp ? '#4ade80' : '#ef4444'"
                      rx="1"
                    />
                  </g>
                </g>

                <!-- Moving Average Line -->
                <path
                  class="line"
                  :d="maPath"
                  fill="none"
                  stroke="#38bdf8"
                  stroke-width="2"
                  filter="url(#glow)"
                />

                <!-- AI Prediction Line -->
                <path
                  class="line prediction"
                  :d="predictionPath"
                  fill="none"
                  stroke="#a855f7"
                  stroke-width="2"
                  stroke-dasharray="5,5"
                />
              </svg>
              <div class="prediction-label">
                AI PREDICTION: <span class="glow-text">{{ predictionLabel }}</span>
              </div>
            </div>
          </div>

          <!-- AI Insights -->
          <div class="card insights-card glass-panel">
            <div class="card-header">
              <h3>AI Insights</h3>
              <button class="refresh-btn" @click="refreshInsights" title="Refresh Insights">
                <span class="icon">↻</span>
              </button>
            </div>
            <div class="insight-list">
              <transition-group name="list">
                <div
                  class="insight-item"
                  v-for="(insight, index) in insights"
                  :key="insight.title + index"
                >
                  <div class="insight-icon-wrapper">
                    <div class="insight-icon">{{ insight.icon }}</div>
                  </div>
                  <div class="insight-content">
                    <div class="insight-title">{{ insight.title }}</div>
                    <div class="insight-desc">{{ insight.desc }}</div>
                  </div>
                  <div class="insight-score" :class="insight.scoreClass">{{ insight.score }}</div>
                </div>
              </transition-group>
            </div>
          </div>

          <!-- AI Trade Signal -->
          <div class="card signal-card glass-panel">
            <div class="card-header">
              <h3>AI Trade Signal</h3>
              <span class="signal-badge" :class="tradeSignal.type">{{ tradeSignal.action }}</span>
            </div>
            <div class="signal-body">
              <div class="signal-row">
                <span class="label">Confidence Score</span>
                <div class="confidence-wrapper">
                  <div class="confidence-bar">
                    <div
                      class="fill"
                      :style="{
                        width: tradeSignal.confidence + '%',
                        background:
                          tradeSignal.type === 'buy'
                            ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                            : 'linear-gradient(90deg, #ef4444, #dc2626)'
                      }"
                    ></div>
                  </div>
                  <span class="value">{{ tradeSignal.confidence }}%</span>
                </div>
              </div>
              <div class="signal-reason">
                <div class="reason-icon">🤖</div>
                <p>{{ tradeSignal.reason }}</p>
              </div>
            </div>
          </div>

          <!-- Order Book / Data Stream -->
          <div class="card data-card glass-panel">
            <div class="card-header">
              <h3>High-Frequency Data Stream</h3>
              <div class="live-dot"></div>
            </div>
            <div class="data-rows">
              <div class="data-row header">
                <span>Time</span>
                <span>Type</span>
                <span>Volume</span>
                <span>AI Signal</span>
              </div>
              <transition-group name="slide-down">
                <div class="data-row" v-for="(row, i) in dataStream" :key="row.time + i">
                  <span class="mono">{{ row.time }}</span>
                  <span :class="row.type === 'BUY' ? 'text-green' : 'text-red'" class="type-tag">{{
                    row.type
                  }}</span>
                  <span class="mono volume">{{ row.volume }} BTC</span>
                  <span class="ai-tag" :class="row.signal.toLowerCase()">{{ row.signal }}</span>
                </div>
              </transition-group>
            </div>
          </div>
        </div>

        <!-- AI Prediction View -->
        <div v-else-if="activeTab === 'prediction'" class="prediction-view">
          <div class="chat-container glass-panel">
            <div class="chat-header">
              <div class="ai-avatar">
                <div class="avatar-circle">N</div>
                <div class="status-dot"></div>
              </div>
              <div class="ai-info">
                <h3>Nexus Oracle</h3>
                <span>Online • v4.2.0</span>
              </div>
            </div>
            <div class="chat-messages" ref="chatContainer">
              <transition-group name="message">
                <div
                  v-for="(msg, idx) in chatMessages"
                  :key="idx"
                  class="message-wrapper"
                  :class="msg.role"
                >
                  <div class="message-bubble">
                    <div class="message-content">{{ msg.content }}</div>
                  </div>
                  <div class="message-meta">{{ msg.role === 'ai' ? 'NEXUS AI' : 'YOU' }}</div>
                </div>
              </transition-group>
              <div v-if="isTyping" class="message-wrapper ai typing">
                <div class="message-bubble typing-bubble">
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                  <span class="typing-dot"></span>
                </div>
                <div class="message-meta">NEXUS AI is thinking...</div>
              </div>
            </div>
            <div class="chat-input-area">
              <div class="input-wrapper">
                <input
                  v-model="userQuery"
                  @keyup.enter="sendMessage"
                  placeholder="Ask Nexus about market trends, specific tokens, or risk analysis..."
                />
                <button @click="sendMessage" :disabled="!userQuery.trim()">
                  <span class="icon">➤</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- HFT Status View -->
        <div v-else-if="activeTab === 'hft'" class="hft-view">
          <div class="terminal-window glass-panel">
            <div class="terminal-header">
              <div class="dots">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <span class="terminal-title">nexus_node_v4.exe - ssh root@nexus-core</span>
            </div>
            <div class="terminal-content">
              <div class="scan-line"></div>
              <transition-group name="list">
                <div v-for="(log, idx) in hftLogs" :key="idx" class="log-line">
                  <span class="log-time">[{{ log.time }}]</span>
                  <span class="log-level" :class="log.level">{{ log.level }}</span>
                  <span class="log-msg">{{ log.message }}</span>
                </div>
              </transition-group>
              <div class="cursor-line">
                <span class="prompt">root@nexus-core:~$</span>
                <span class="cursor">_</span>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- Settings Modal -->
    <transition name="fade">
      <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
        <div class="modal-content glass-panel">
          <div class="modal-header">
            <h3>Dashboard Settings</h3>
            <button class="close-btn" @click="showSettings = false">×</button>
          </div>
          <div class="setting-group">
            <label>Data Refresh Rate</label>
            <div class="select-wrapper">
              <select>
                <option>Real-time (100ms)</option>
                <option>Fast (1s)</option>
                <option>Normal (5s)</option>
              </select>
            </div>
          </div>
          <div class="setting-group">
            <label>AI Model</label>
            <div class="select-wrapper">
              <select>
                <option>Nexus v4 (Balanced)</option>
                <option>Nexus v5-Beta (Aggressive)</option>
              </select>
            </div>
          </div>
          <div class="setting-group">
            <label>Theme</label>
            <div class="theme-options">
              <button class="theme-btn active">Dark</button>
              <button class="theme-btn">Cyber</button>
            </div>
          </div>
          <button class="save-btn" @click="showSettings = false">Save Configuration</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const activeTab = ref('dashboard');
const isAnalyzing = ref(false);
const confidence = ref(98.4);
const latency = ref(0.4);
const showSettings = ref(false);
const predictionLabel = ref('BULLISH BREAKOUT');

const tradeSignal = ref({
  action: 'STRONG BUY',
  type: 'buy',
  confidence: 94.2,
  reason:
    'RSI divergence detected combined with increased volume on the 4H timeframe. Neural pattern match: "Golden Cross" scenario.'
});

const goBack = () => router.push('/');

const pageTitle = computed(() => {
  if (activeTab.value === 'dashboard') return 'Market Anomaly Detection';
  if (activeTab.value === 'prediction') return 'Neural Predictive Engine';
  return 'HFT Node Status';
});

// --- Dashboard Logic ---
// Generate initial candlesticks
const generateCandles = (count: number) => {
  let price = 65000;
  const candles = [];
  for (let i = 0; i < count; i++) {
    const move = (Math.random() - 0.45) * 200;
    const open = price;
    const close = price + move;
    const high = Math.max(open, close) + Math.random() * 50;
    const low = Math.min(open, close) - Math.random() * 50;
    candles.push({ open, close, high, low });
    price = close;
  }
  return candles;
};

const rawCandles = ref(generateCandles(50));

const mapToY = (val: number, min: number, max: number, height: number) => {
  return height - ((val - min) / (max - min)) * height;
};

const candlesticks = computed(() => {
  const data = rawCandles.value;
  const minPrice = Math.min(...data.map((c) => c.low));
  const maxPrice = Math.max(...data.map((c) => c.high));
  const width = 800;
  const height = 300;
  const candleWidth = width / data.length;

  return data.map((c, i) => ({
    x: i * candleWidth + candleWidth / 2,
    openY: mapToY(c.open, minPrice, maxPrice, height),
    closeY: mapToY(c.close, minPrice, maxPrice, height),
    highY: mapToY(c.high, minPrice, maxPrice, height),
    lowY: mapToY(c.low, minPrice, maxPrice, height),
    isUp: c.close >= c.open
  }));
});

const maPath = computed(() => {
  const data = rawCandles.value;
  // Simple Moving Average
  const points = data
    .map((c, i) => {
      if (i < 5) return null;
      const sum = data.slice(i - 5, i).reduce((acc, curr) => acc + curr.close, 0);
      const avg = sum / 5;
      const minPrice = Math.min(...data.map((c) => c.low));
      const maxPrice = Math.max(...data.map((c) => c.high));
      const x = i * (800 / data.length) + 800 / data.length / 2;
      const y = mapToY(avg, minPrice, maxPrice, 300);
      return `${x},${y}`;
    })
    .filter((p) => p !== null);

  return `M${points.join(' L')}`;
});

const predictionPath = computed(() => {
  // Simple projection from last point
  const lastCandle = candlesticks.value[candlesticks.value.length - 1];
  if (!lastCandle) return '';
  return `M${lastCandle.x},${lastCandle.closeY} Q${lastCandle.x + 50},${lastCandle.closeY - 50} ${lastCandle.x + 100},${lastCandle.closeY - 80}`;
});

const insights = ref([
  {
    icon: '🚀',
    title: 'Momentum Shift',
    desc: 'Volume spike detected in Asian session.',
    score: '+8.2',
    scoreClass: 'positive'
  },
  {
    icon: '⚠️',
    title: 'Volatility Warning',
    desc: 'Bollinger bands expansion predicted.',
    score: 'High',
    scoreClass: 'warning'
  },
  {
    icon: '🐋',
    title: 'Whale Activity',
    desc: 'Large wallet movement tracking.',
    score: 'Alert',
    scoreClass: 'neutral'
  }
]);

const dataStream = ref([
  { time: '15:59:07', type: 'SELL', volume: '1.7140', signal: 'DISTRIBUTE' },
  { time: '15:59:06', type: 'BUY', volume: '7.7418', signal: 'ACCUMULATE' },
  { time: '15:59:05', type: 'SELL', volume: '6.0762', signal: 'DISTRIBUTE' },
  { time: '15:59:04', type: 'BUY', volume: '5.5712', signal: 'ACCUMULATE' },
  { time: '15:59:03', type: 'SELL', volume: '9.5612', signal: 'DISTRIBUTE' }
]);

const runAnalysis = () => {
  isAnalyzing.value = true;
  setTimeout(() => {
    isAnalyzing.value = false;
    confidence.value = +(Math.random() * 5 + 94).toFixed(1);

    // Update chart data
    const lastClose = rawCandles.value[rawCandles.value.length - 1].close;
    const newCandle = {
      open: lastClose,
      close: lastClose + (Math.random() - 0.4) * 300,
      high: lastClose + 350,
      low: lastClose - 100
    };
    rawCandles.value.push(newCandle);
    rawCandles.value.shift();

    insights.value.unshift({
      icon: '⚡',
      title: 'New Anomaly',
      desc: 'Flash crash pattern detected in derivative markets.',
      score: 'CRITICAL',
      scoreClass: 'warning'
    });
    if (insights.value.length > 4) insights.value.pop();

    // Update Signal
    const isBuy = Math.random() > 0.5;
    tradeSignal.value = {
      action: isBuy ? 'STRONG BUY' : 'STRONG SELL',
      type: isBuy ? 'buy' : 'sell',
      confidence: +(Math.random() * 15 + 80).toFixed(1),
      reason: isBuy
        ? 'Golden Cross detected on 4H chart. Whale accumulation observed in key support zones.'
        : 'Bearish divergence on RSI. High sell wall detected at resistance level $68,500.'
    };
  }, 1500);
};

const refreshInsights = () => {
  insights.value = insights.value.sort(() => Math.random() - 0.5);
};

// --- Chat Logic ---
const userQuery = ref('');
const isTyping = ref(false);
const chatMessages = ref([
  {
    role: 'ai',
    content:
      'Hello. I am NEXUS, your advanced market analyst. I can predict price movements, analyze sentiment, and audit smart contracts. How can I assist you today?'
  }
]);
const chatContainer = ref<HTMLElement | null>(null);

const sendMessage = () => {
  if (!userQuery.value.trim()) return;

  chatMessages.value.push({ role: 'user', content: userQuery.value });
  const query = userQuery.value;
  userQuery.value = '';
  isTyping.value = true;

  nextTick(() => {
    if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  });

  setTimeout(() => {
    isTyping.value = false;
    let response = "I've analyzed the current market vectors. ";
    if (query.toLowerCase().includes('btc') || query.toLowerCase().includes('bitcoin')) {
      response +=
        'Bitcoin shows strong accumulation patterns in the $65k-$68k range. On-chain metrics suggest a supply shock is imminent. RSI is resetting, suggesting a buy zone.';
    } else if (query.toLowerCase().includes('eth') || query.toLowerCase().includes('ethereum')) {
      response +=
        'Ethereum gas fees are stabilizing. Layer 2 volume has increased by 40% in the last 24h, indicating a bullish divergence.';
    } else if (query.toLowerCase().includes('sol') || query.toLowerCase().includes('solana')) {
      response +=
        'Solana network activity is at an ATH. Developer retention is high. My model predicts a 15% upside in the short term.';
    } else {
      response +=
        'My neural networks detect high volatility incoming. I recommend adjusting your leverage and monitoring the HFT status tab for real-time liquidity changes.';
    }
    chatMessages.value.push({ role: 'ai', content: response });
    nextTick(() => {
      if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    });
  }, 1500);
};

// --- HFT Logic ---
const hftLogs = ref([
  { time: '16:00:01', level: 'INFO', message: 'Connected to Exchange A WebSocket feed.' },
  {
    time: '16:00:02',
    level: 'SUCCESS',
    message: 'Arbitrage opportunity found: ETH/USDT (0.4% spread).'
  },
  {
    time: '16:00:02',
    level: 'WARN',
    message: 'High network congestion detected. Increasing gas priority.'
  }
]);

let timer: number;

onMounted(() => {
  // Simulate live data updates
  timer = window.setInterval(() => {
    // Update latency
    latency.value = +(0.3 + Math.random() * 0.4).toFixed(1);

    // Update Candles randomly
    if (Math.random() > 0.7) {
      const last = rawCandles.value[rawCandles.value.length - 1];
      const change = (Math.random() - 0.5) * 50;
      last.close += change;
      last.high = Math.max(last.high, last.close);
      last.low = Math.min(last.low, last.close);
      // Occasionally add new candle
      if (Math.random() > 0.9) {
        rawCandles.value.push({
          open: last.close,
          close: last.close,
          high: last.close,
          low: last.close
        });
        rawCandles.value.shift();
      }
    }

    // Update data stream
    const type = Math.random() > 0.5 ? 'BUY' : 'SELL';
    dataStream.value.unshift({
      time: new Date().toLocaleTimeString(),
      type,
      volume: (Math.random() * 10).toFixed(4),
      signal: type === 'BUY' ? 'ACCUMULATE' : 'DISTRIBUTE'
    });
    if (dataStream.value.length > 8) dataStream.value.pop();

    // Update HFT logs if on tab
    if (activeTab.value === 'hft') {
      const msgs = [
        'Micro-structure analysis complete.',
        'Order book depth updated.',
        'Slippage protection activated.',
        'Neural weights optimized.',
        'Executing triangular arbitrage...'
      ];
      hftLogs.value.push({
        time: new Date().toLocaleTimeString(),
        level: Math.random() > 0.8 ? 'WARN' : 'INFO',
        message: msgs[Math.floor(Math.random() * msgs.length)]
      });
      if (hftLogs.value.length > 20) hftLogs.value.shift();
    }
  }, 1000);
});

onBeforeUnmount(() => {
  clearInterval(timer);
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

.nexus-dashboard {
  display: flex;
  min-height: 100vh;
  background: #0a0a0a;
  color: #e0e0e0;
  font-family: 'Inter', sans-serif;
}

.sidebar {
  width: 260px;
  background: #050505;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  padding: 30px 20px;
  position: sticky;
  top: 0;
  height: 100vh;
  flex-shrink: 0;
}

/* Tablet Adaptation (980px - 1280px) */
@media (min-width: 980px) and (max-width: 1280px) {
  .sidebar {
    border-radius: 0;
    border-left: none;
    margin-left: 0;
  }
}

.sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.back-home-btn {
  background: transparent;
  color: #666;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px;
  border-radius: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-weight: 500;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  transition: all 0.3s;
}

.back-home-btn:hover {
  background: #fff;
  color: #000;
  border-color: #fff;
}

@media (max-width: 768px) {
  .nexus-dashboard {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    height: auto;
    position: relative;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 15px;
  }

  .sidebar nav {
    display: flex;
    overflow-x: auto;
    gap: 20px;
    padding-bottom: 5px;
  }

  .nav-item {
    white-space: nowrap;
    margin-bottom: 0;
  }

  .sidebar-footer {
    display: none;
  }

  header {
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
  }

  .header-left {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .signal-card {
    grid-column: span 1;
  }

  .header-actions {
    width: 100%;
    justify-content: space-between;
  }

  .main-content {
    padding: 20px;
  }

  .mobile-back-btn {
    display: block !important;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    width: 40px;
    height: 40px;
    border-radius: 0;
    font-size: 1.2rem;
    cursor: pointer;
  }
}

.mobile-back-btn {
  display: none;
}

.logo {
  font-size: 1.2rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 50px;
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: 0.05em;
}

.ai-badge {
  font-size: 0.6rem;
  background: #fff;
  color: #000;
  padding: 2px 6px;
  border-radius: 2px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.nav-item {
  padding: 14px 16px;
  margin-bottom: 4px;
  border-radius: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 16px;
  color: #666;
  font-size: 0.9rem;
  transition: all 0.3s;
  border-left: 2px solid transparent;
}

.nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.03);
}

.nav-item.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
  border-left-color: #fff;
}

.nav-item .icon {
  filter: grayscale(100%);
  opacity: 0.7;
}

.nav-item.active .icon {
  filter: grayscale(0%);
  opacity: 1;
}

.system-status {
  background: rgba(255, 255, 255, 0.03);
  padding: 20px;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.status-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  margin-bottom: 10px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.value {
  color: #e0e0e0;
  font-family: 'JetBrains Mono', monospace;
}

.value.success {
  color: #fff; /* White instead of green */
}

.main-content {
  flex: 1;
  padding: 40px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
}

.header-left {
  display: flex;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 24px;
}

.action-btn {
  background: #fff;
  color: #000;
  border: none;
  padding: 10px 24px;
  border-radius: 0;
  font-weight: 600;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: opacity 0.3s;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

h1 {
  font-size: 1.8rem;
  font-weight: 400;
  color: #fff;
  letter-spacing: -0.02em;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-weight: 500;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
}

.dot {
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
}

@media (max-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

.card {
  background: #0f0f0f;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0; /* Sharp corners */
  padding: 30px;
}

.chart-card {
  grid-column: 1 / -1;
}

@media (min-width: 1200px) {
  .chart-card {
    grid-column: 1 / 3;
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.card-header h3 {
  font-weight: 500;
  font-size: 1rem;
  color: #fff;
}

.refresh-icon {
  cursor: pointer;
  font-size: 1rem;
  color: #666;
  transition: color 0.3s;
}
.refresh-icon:hover {
  color: #fff;
}

.highlight {
  color: #fff;
  font-weight: 600;
}

.confidence {
  font-size: 0.8rem;
  color: #888;
}

.chart-visual {
  position: relative;
  height: 350px;
  width: 100%;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0;
  overflow: hidden;
}

.line-chart {
  width: 100%;
  height: 100%;
}

.prediction-label {
  position: absolute;
  top: 20px;
  right: 20px;
  background: #fff;
  color: #000;
  padding: 6px 12px;
  border-radius: 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 20px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  margin-bottom: 0;
  background: transparent;
  border-radius: 0;
}

.insight-item:last-child {
  border-bottom: none;
}

.insight-icon {
  font-size: 1.2rem;
  filter: grayscale(100%);
}

.insight-content {
  flex: 1;
}

.insight-title {
  font-weight: 500;
  color: #fff;
  font-size: 0.9rem;
  margin-bottom: 6px;
}

.insight-desc {
  font-size: 0.8rem;
  color: #666;
  line-height: 1.4;
}

.insight-score {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  font-size: 0.8rem;
  opacity: 0.8;
}

.positive {
  color: #fff;
}
.warning {
  color: #ccc;
}
.neutral {
  color: #888;
}

.data-rows {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
}

.data-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  gap: 10px;
  align-items: center;
}

.data-row:last-child {
  border-bottom: none;
}

.data-row.header {
  color: #666;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.text-green {
  color: #fff;
}
.text-red {
  color: #666;
}

.ai-tag {
  background: #fff;
  color: #000;
  padding: 2px 6px;
  border-radius: 0;
  text-align: center;
  font-size: 0.65rem;
  font-weight: 600;
  width: fit-content;
}

/* Signal Card */
.signal-badge {
  padding: 4px 10px;
  border-radius: 0;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.signal-badge.buy {
  background: #fff;
  color: #000;
  border: 1px solid #fff;
}

.signal-badge.sell {
  background: transparent;
  color: #fff;
  border: 1px solid #fff;
}

.signal-body {
  margin-top: 20px;
}

.signal-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}

.label {
  font-size: 0.8rem;
  color: #666;
  text-transform: uppercase;
}

.confidence-bar {
  flex: 1;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 0;
  overflow: hidden;
}

.confidence-bar .fill {
  height: 100%;
  border-radius: 0;
  background: #fff !important; /* Force white */
  transition: width 0.5s ease;
}

.signal-reason {
  background: rgba(255, 255, 255, 0.03);
  padding: 16px;
  border-radius: 0;
  display: flex;
  gap: 12px;
  font-size: 0.85rem;
  color: #aaa;
  line-height: 1.5;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* Prediction View Styles */
.prediction-view {
  height: 600px;
  background: #0f0f0f;
  border-radius: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.message {
  max-width: 80%;
  padding: 16px 20px;
  border-radius: 0;
  line-height: 1.6;
  font-size: 0.9rem;
}

.message.ai {
  align-self: flex-start;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #ccc;
}

.message.user {
  align-self: flex-end;
  background: #fff;
  border: 1px solid #fff;
  color: #000;
}

.message-role {
  font-size: 0.65rem;
  margin-bottom: 6px;
  opacity: 0.6;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.chat-input {
  padding: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  gap: 15px;
  background: #0f0f0f;
}

.chat-input input {
  flex: 1;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 14px;
  border-radius: 0;
  color: #fff;
  outline: none;
  font-family: inherit;
  transition: border-color 0.3s;
}

.chat-input input:focus {
  border-color: #fff;
}

.chat-input button {
  background: #fff;
  color: #000;
  border: none;
  padding: 0 24px;
  border-radius: 0;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.05em;
}

/* HFT View Styles */
.hft-view {
  height: 600px;
}

.terminal-window {
  background: #000;
  border-radius: 0;
  height: 100%;
  font-family: 'JetBrains Mono', monospace;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.terminal-header {
  background: #0a0a0a;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  gap: 16px;
  border-radius: 0;
}

.dots {
  display: flex;
  gap: 8px;
  filter: grayscale(100%); /* Monochrome dots */
}

.dots .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #333;
}

.terminal-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  color: #fff;
  font-size: 0.85rem;
  line-height: 1.5;
}

.log-line {
  margin-bottom: 6px;
}

.log-time {
  color: #444;
  margin-right: 12px;
}
.log-level {
  margin-right: 12px;
  font-weight: 500;
}
.log-level.INFO {
  color: #888;
}
.log-level.WARN {
  color: #fff;
  text-decoration: underline;
}
.log-level.SUCCESS {
  color: #fff;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
  100% {
    opacity: 1;
  }
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(8px);
}

.modal-content {
  background: #0f0f0f;
  padding: 40px;
  border-radius: 0;
  width: 90%;
  max-width: 450px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
}

.modal-content h3 {
  margin-bottom: 30px;
  font-size: 1.2rem;
  font-weight: 500;
}

.setting-group {
  margin-bottom: 24px;
}

.setting-group label {
  display: block;
  margin-bottom: 10px;
  color: #888;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.setting-group select {
  width: 100%;
  padding: 12px;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0;
  color: #fff;
  outline: none;
}

.theme-options {
  display: flex;
  gap: 12px;
}

.theme-options button {
  flex: 1;
  padding: 12px;
  background: #0a0a0a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #666;
  border-radius: 0;
  cursor: pointer;
  transition: all 0.3s;
}

.theme-options button.active {
  background: #fff;
  border-color: #fff;
  color: #000;
}

.save-btn {
  width: 100%;
  padding: 14px;
  background: #fff;
  color: #000;
  border: none;
  border-radius: 0;
  font-weight: 600;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 10px;
}
</style>
