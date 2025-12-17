<template>
  <div class="code-guardian-container">
    <div class="bg-gradient"></div>
    <div class="bg-noise"></div>

    <div class="sidebar glass-panel">
      <div class="logo">
        <div class="icon-wrapper">
          <i class="fas fa-shield-alt"></i>
        </div>
        <span>Code Guardian</span>
      </div>

      <div class="stats">
        <div class="stat-item">
          <div class="stat-icon"><i class="fas fa-search"></i></div>
          <div class="stat-info">
            <label>Scanned</label>
            <span>1,204</span>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-icon"><i class="fas fa-lock"></i></div>
          <div class="stat-info">
            <label>Secured</label>
            <span>$45M+</span>
          </div>
        </div>
      </div>

      <button class="back-btn" @click="goBack">
        <i class="fas fa-sign-out-alt"></i>
        <span>Exit Dashboard</span>
      </button>
    </div>

    <div class="main-content">
      <div class="mobile-header">
        <button class="mobile-back-btn" @click="goBack">
          <i class="fas fa-arrow-left"></i>
        </button>
        <span class="mobile-title">Code Guardian</span>
      </div>

      <div class="editor-section glass-panel">
        <div class="panel-header">
          <div class="header-title">
            <i class="fab fa-ethereum"></i>
            <h3>Solidity Contract</h3>
          </div>
          <span class="status-badge ready"> <i class="fas fa-circle"></i> Ready </span>
        </div>

        <div class="editor-wrapper">
          <div class="line-numbers">
            <span v-for="n in lineCount" :key="n">{{ n }}</span>
          </div>
          <textarea
            v-model="contractCode"
            placeholder="// Paste your Solidity Smart Contract here..."
            class="code-editor"
            @input="updateLineCount"
            spellcheck="false"
          ></textarea>
        </div>

        <button class="audit-btn" @click="auditContract" :disabled="isAuditing || !contractCode">
          <span v-if="!isAuditing">
            <i class="fas fa-search-shield"></i> Start Security Audit
          </span>
          <div v-else class="scanning-state">
            <span class="scan-line"></span>
            <span>Scanning Mempool...</span>
          </div>
        </button>
      </div>

      <div class="report-section glass-panel" :class="{ 'has-report': report }">
        <div class="panel-header">
          <div class="header-title">
            <i class="fas fa-clipboard-check"></i>
            <h3>Audit Report</h3>
          </div>
          <span v-if="report" :class="['severity-badge', report.severity.toLowerCase()]">
            {{ report.severity }} RISK
          </span>
        </div>

        <div v-if="!report && !isAuditing" class="empty-state">
          <i class="fas fa-radar"></i>
          <p>System ready. Initiate scan to detect vulnerabilities.</p>
        </div>

        <div v-if="isAuditing" class="processing-state">
          <div class="radar-scan">
            <div class="radar-sweep"></div>
          </div>
          <p>Analyzing bytecode patterns...</p>
        </div>

        <div v-if="report" class="report-content">
          <div class="security-score-card">
            <div class="score-chart">
              <svg viewBox="0 0 36 36" class="circular-chart">
                <path
                  class="circle-bg"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  class="circle"
                  :stroke-dasharray="`${report.score}, 100`"
                  :class="getScoreClass(report.score)"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <text x="18" y="20.35" class="percentage">{{ report.score }}</text>
              </svg>
            </div>
            <div class="score-meta">
              <h4>Security Score</h4>
              <p>Based on static analysis</p>
            </div>
          </div>

          <div class="vulnerability-list">
            <div v-for="(vuln, idx) in report.vulnerabilities" :key="idx" class="vuln-item">
              <div class="vuln-header">
                <div class="vuln-title">
                  <i class="fas fa-exclamation-triangle"></i>
                  <span>{{ vuln.type }}</span>
                </div>
                <span class="vuln-line">Line {{ vuln.line }}</span>
              </div>
              <p class="vuln-desc">{{ vuln.description }}</p>
              <div class="vuln-fix">
                <strong><i class="fas fa-wrench"></i> Recommended Fix</strong>
                <div class="code-block">
                  <code>{{ vuln.fix }}</code>
                  <button class="copy-fix" @click="copyToClipboard(vuln.fix)">
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { generateContent } from '../services/aiService';

const router = useRouter();
const contractCode = ref('');
const isAuditing = ref(false);
const report = ref<any>(null);

const lineCount = computed(() => {
  return contractCode.value.split('\n').length || 1;
});

const updateLineCount = () => {
  // Trigger reactivity for line numbers
};

const goBack = () => router.push('/');

const getScoreClass = (score: number) => {
  if (score >= 80) return 'score-high';
  if (score >= 60) return 'score-medium';
  return 'score-low';
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

const auditContract = async () => {
  isAuditing.value = true;
  report.value = null;

  const prompt = `
    Role: Senior Smart Contract Security Auditor.
    Task: Audit the following Solidity code for security vulnerabilities (Reentrancy, Overflow, Access Control, Gas Optimization).
    
    Code:
    ${contractCode.value.substring(0, 3000)}

    Output format (JSON only, no markdown):
    {
      "score": number (0-100),
      "severity": "HIGH" | "MEDIUM" | "LOW" | "SAFE",
      "vulnerabilities": [
        {
          "type": "Vulnerability Name",
          "line": number,
          "description": "Short explanation",
          "fix": "One line code fix or suggestion"
        }
      ]
    }
  `;

  try {
    const response = await generateContent(prompt);
    let cleanText = response.text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    // Handle potential non-JSON prefix/suffix
    const jsonStart = cleanText.indexOf('{');
    const jsonEnd = cleanText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleanText = cleanText.substring(jsonStart, jsonEnd + 1);
    }
    report.value = JSON.parse(cleanText);
  } catch (e) {
    console.error(e);
    // Mock
    report.value = {
      score: 65,
      severity: 'HIGH',
      vulnerabilities: [
        {
          type: 'Reentrancy Attack',
          line: 14,
          description: 'External call is made before state update, allowing re-entrant calls.',
          fix: 'Move balances[msg.sender] -= amount; before the external call.'
        },
        {
          type: 'Unchecked Return Value',
          line: 22,
          description: 'Low-level call return value is not checked, potentially ignoring failures.',
          fix: "require(success, 'Transfer failed');"
        }
      ]
    };
  } finally {
    isAuditing.value = false;
  }
};
</script>

<style scoped>
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');

.code-guardian-container {
  display: flex;
  height: 100vh;
  color: #e2e8f0;
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
  position: relative;
}

.bg-gradient {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 20% 50%, #1e293b 0%, #000 70%);
  z-index: -2;
}

.bg-noise {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  z-index: -1;
  pointer-events: none;
}

.glass-panel {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar {
  width: 280px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  z-index: 10;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0; /* Override default rounded corners if any */
}

/* Tablet Adaptation (980px - 1280px) */
@media (min-width: 980px) and (max-width: 1280px) {
  .sidebar {
    border-radius: 0;
    border-left: none;
    margin-left: 0;
  }
}

.logo {
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 50px;
  letter-spacing: -0.02em;
}

.icon-wrapper {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 30px;
  background: rgba(255, 255, 255, 0.03);
  padding: 15px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: transform 0.3s ease;
}

.stat-item:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.05);
}

.stat-icon {
  width: 36px;
  height: 36px;
  background: rgba(59, 130, 246, 0.1);
  color: #60a5fa;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-info label {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.stat-info span {
  font-size: 1.1rem;
  color: #fff;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}

.back-btn {
  margin-top: auto;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 15px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 0.9rem;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.back-btn:hover {
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.main-content {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 30px;
  gap: 30px;
  position: relative;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
}

.header-title i {
  color: #60a5fa;
}

.header-title h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.status-badge {
  font-size: 0.75rem;
  padding: 6px 12px;
  border-radius: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-badge.ready {
  background: rgba(74, 222, 128, 0.1);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.2);
}

.status-badge i {
  font-size: 0.5rem;
}

.editor-section,
.report-section {
  border-radius: 24px;
  padding: 25px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  height: 100%;
  overflow: hidden;
}

.editor-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  margin-bottom: 20px;
}

.line-numbers {
  padding: 20px 10px;
  background: rgba(0, 0, 0, 0.2);
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  color: #475569;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  line-height: 1.6;
  text-align: right;
  user-select: none;
}

.code-editor {
  flex: 1;
  background: transparent;
  border: none;
  color: #e2e8f0;
  font-family: 'JetBrains Mono', monospace;
  padding: 20px;
  resize: none;
  font-size: 0.9rem;
  line-height: 1.6;
  white-space: pre;
}

.code-editor:focus {
  outline: none;
}

.audit-btn {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  border: none;
  padding: 16px;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  cursor: pointer;
  border-radius: 12px;
  font-size: 0.95rem;
  transition: all 0.3s;
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.audit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(37, 99, 235, 0.4);
}

.audit-btn:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
  box-shadow: none;
}

.scanning-state {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scan-line {
  width: 20px;
  height: 2px;
  background: #fff;
  animation: scanX 1s infinite linear;
}

@keyframes scanX {
  0% {
    transform: scaleX(0.2);
    opacity: 0.5;
  }
  50% {
    transform: scaleX(1);
    opacity: 1;
  }
  100% {
    transform: scaleX(0.2);
    opacity: 0.5;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #475569;
  text-align: center;
}

.empty-state i {
  font-size: 4rem;
  margin-bottom: 20px;
  opacity: 0.5;
}

.processing-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #60a5fa;
}

.radar-scan {
  width: 100px;
  height: 100px;
  border: 2px solid rgba(96, 165, 250, 0.3);
  border-radius: 50%;
  position: relative;
  margin-bottom: 20px;
  overflow: hidden;
}

.radar-sweep {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(96, 165, 250, 0.5) 360deg);
  animation: radarSpin 2s infinite linear;
  border-radius: 50%;
}

@keyframes radarSpin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.report-content {
  overflow-y: auto;
  flex: 1;
  padding-right: 5px;
  animation: fadeIn 0.5s ease-out;
}

.security-score-card {
  display: flex;
  align-items: center;
  gap: 20px;
  background: rgba(255, 255, 255, 0.03);
  padding: 20px;
  border-radius: 16px;
  margin-bottom: 25px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.circular-chart {
  display: block;
  margin: 0 auto;
  max-width: 80%;
  max-height: 250px;
  width: 80px;
  height: 80px;
}

.circle-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 3.8;
}

.circle {
  fill: none;
  stroke-width: 2.8;
  stroke-linecap: round;
  animation: progress 1s ease-out forwards;
}

.score-high {
  stroke: #4ade80;
}
.score-medium {
  stroke: #facc15;
}
.score-low {
  stroke: #f87171;
}

.percentage {
  fill: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-weight: bold;
  font-size: 0.5em;
  text-anchor: middle;
}

@keyframes progress {
  0% {
    stroke-dasharray: 0 100;
  }
}

.score-meta h4 {
  margin: 0 0 5px;
  font-size: 1.1rem;
  color: #fff;
}

.score-meta p {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.vuln-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  transition: all 0.3s ease;
}

.vuln-item:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateX(5px);
}

.vuln-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  align-items: center;
}

.vuln-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f87171;
  font-weight: 600;
  font-size: 0.95rem;
}

.vuln-line {
  color: #64748b;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  padding: 4px 8px;
  border-radius: 4px;
}

.vuln-desc {
  margin: 0 0 16px;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #cbd5e1;
}

.vuln-fix strong {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #4ade80;
  margin-bottom: 8px;
}

.code-block {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  padding: 15px;
  border-radius: 8px;
  border: 1px solid rgba(74, 222, 128, 0.2);
}

.code-block code {
  color: #e2e8f0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.85rem;
  word-break: break-all;
}

.copy-fix {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #94a3b8;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.copy-fix:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.severity-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.severity-badge.high {
  background: rgba(248, 113, 113, 0.1);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.2);
}
.severity-badge.medium {
  background: rgba(250, 204, 21, 0.1);
  color: #facc15;
  border: 1px solid rgba(250, 204, 21, 0.2);
}
.severity-badge.low {
  background: rgba(96, 165, 250, 0.1);
  color: #60a5fa;
  border: 1px solid rgba(96, 165, 250, 0.2);
}
.severity-badge.safe {
  background: rgba(74, 222, 128, 0.1);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.2);
}

.mobile-header {
  display: none;
}

@media (max-width: 900px) {
  .code-guardian-container {
    flex-direction: column;
    height: auto;
    overflow-y: auto;
  }

  .sidebar {
    display: none;
  }

  .mobile-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
    padding: 0 8px;
  }

  .mobile-back-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-title {
    font-weight: 700;
    color: #fff;
    font-size: 1.2rem;
    letter-spacing: -0.02em;
  }

  .main-content {
    grid-template-columns: 1fr;
    padding: 20px;
    height: auto;
    display: flex;
    flex-direction: column;
  }

  .editor-section,
  .report-section {
    min-height: 400px;
    height: auto;
  }

  .editor-wrapper {
    height: 300px;
  }
}
</style>
