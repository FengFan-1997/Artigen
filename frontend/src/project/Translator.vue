<template>
  <div class="translator-page">
    <div class="tool-container">
      <header class="tool-header">
        <div class="header-content">
          <div class="icon-wrapper">
            <i class="fas fa-language"></i>
          </div>
          <div class="title-group">
            <h1>AI Polyglot & Polisher</h1>
            <p class="subtitle">
              Translate, Polish, and Summarize with intelligent context awareness
            </p>
          </div>
        </div>
        <router-link to="/portfolio-home" class="back-link">
          <i class="fas fa-arrow-left"></i> Back
        </router-link>
      </header>

      <div class="control-panel">
        <div class="control-group">
          <label>Action</label>
          <LabelTypeSelect
            :modelValue="actions.findIndex((a) => a.value === actionStr)"
            :options="actions.map((a, i) => ({ label: a.label, value: i, gtm: a.value }))"
            @update:modelValue="(i) => (actionStr = actions[i].value)"
          />
        </div>

        <div class="control-group" v-if="actionStr === 'translate'">
          <label>Target Language</label>
          <LabelTypeSelect
            :modelValue="languages.findIndex((l) => l.value === targetLang)"
            :options="languages.map((l, i) => ({ label: l.label, value: i, gtm: l.value }))"
            @update:modelValue="(i) => (targetLang = languages[i].value)"
          />
        </div>

        <div class="control-group" v-if="actionStr === 'polish'">
          <label>Tone</label>
          <LabelTypeSelect
            :modelValue="tones.findIndex((t) => t.value === tone)"
            :options="tones.map((t, i) => ({ label: t.label, value: i, gtm: t.value }))"
            @update:modelValue="(i) => (tone = tones[i].value)"
          />
        </div>
      </div>

      <div class="workspace">
        <div class="input-section">
          <div class="section-header">
            <span>Input Text</span>
            <span class="char-count">{{ inputText.length }} chars</span>
          </div>
          <textarea
            v-model="inputText"
            placeholder="Enter text here..."
            :disabled="isLoading"
          ></textarea>
        </div>

        <div class="action-bar">
          <button
            class="process-btn"
            @click="processText"
            :disabled="isLoading || !inputText.trim()"
          >
            <i class="fas fa-spinner fa-spin" v-if="isLoading"></i>
            <span v-else>
              <i class="fas fa-magic"></i>
            </span>
          </button>
        </div>

        <div class="output-section">
          <div class="section-header">
            <span>Result</span>
            <button class="copy-btn" @click="copyToClipboard" v-if="outputText">
              <i class="fas" :class="copySuccess ? 'fa-check' : 'fa-copy'"></i>
              {{ copySuccess ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <div class="output-display" :class="{ placeholder: !outputText }">
            <div v-if="isLoading" class="loading-state">
              <div class="pulse-ring"></div>
              <span>Generating magic...</span>
            </div>
            <div v-else-if="outputText" class="result-text">{{ outputText }}</div>
            <div v-else class="empty-text">Result will appear here...</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import LabelTypeSelect from '@/Ingredient/utils/LabelTypeSelect.vue';
import { generateContent } from '@/services/aiService';

const inputText = ref('');
const outputText = ref('');
const isLoading = ref(false);
const copySuccess = ref(false);

const actionStr = ref('translate');
const targetLang = ref('English');
const tone = ref('Professional');

const actions = [
  { label: 'Translate', value: 'translate' },
  { label: 'Polish', value: 'polish' },
  { label: 'Summarize', value: 'summarize' }
];

const languages = [
  { label: 'English', value: 'English' },
  { label: 'Chinese', value: 'Chinese' },
  { label: 'Japanese', value: 'Japanese' },
  { label: 'Spanish', value: 'Spanish' },
  { label: 'French', value: 'French' },
  { label: 'German', value: 'German' }
];

const tones = [
  { label: 'Professional', value: 'Professional' },
  { label: 'Casual', value: 'Casual' },
  { label: 'Academic', value: 'Academic' },
  { label: 'Creative', value: 'Creative' }
];

const processText = async () => {
  if (!inputText.value.trim() || isLoading.value) return;

  isLoading.value = true;
  outputText.value = '';

  let prompt = '';
  if (actionStr.value === 'translate') {
    prompt = `Translate the following text into ${targetLang.value}. Maintain the original meaning but ensure natural phrasing in the target language:\n\n${inputText.value}`;
  } else if (actionStr.value === 'polish') {
    prompt = `Rewrite the following text to make it more ${tone.value.toLowerCase()}. Improve grammar, clarity, and flow:\n\n${inputText.value}`;
  } else if (actionStr.value === 'summarize') {
    prompt = `Provide a concise summary of the following text:\n\n${inputText.value}`;
  }

  const response = await generateContent(prompt);

  if (response.error) {
    outputText.value = `Error: ${response.error}`;
  } else {
    outputText.value = response.text;
  }

  isLoading.value = false;
};

const copyToClipboard = async () => {
  if (!outputText.value) return;
  try {
    await navigator.clipboard.writeText(outputText.value);
    copySuccess.value = true;
    setTimeout(() => {
      copySuccess.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
};
</script>

<style scoped>
.translator-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f8fafc; /* Light background */
  padding: 40px 20px;
  padding-left: 100px;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif;
  color: #334155; /* Dark slate text */
  box-sizing: border-box;
}

.tool-container {
  width: 100%;
  max-width: 1200px;
  background: #ffffff; /* White container */
  border: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08); /* Soft shadow */
  border-radius: 24px;
  overflow: hidden;
}

.tool-header {
  padding: 40px 50px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  background: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.back-link {
  color: #64748b;
  text-decoration: none;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  font-weight: 500;
  opacity: 0.7;
}

.back-link:hover {
  color: #0f172a;
  opacity: 1;
  transform: translateX(-4px);
}

.icon-wrapper {
  width: 56px;
  height: 56px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #0f172a;
  flex-shrink: 0;
  transition: all 0.3s ease;
  border-radius: 12px;
}

.tool-header:hover .icon-wrapper {
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transform: translateY(-2px);
}

.title-group h1 {
  font-family: 'Playfair Display', serif;
  font-size: 36px;
  font-weight: 600;
  margin: 0;
  color: #0f172a;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.subtitle {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 14px;
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  letter-spacing: 0.3px;
}

.control-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  padding: 30px 50px;
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 220px;
  flex: 1;
}

.control-group label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #64748b;
  font-weight: 600;
  margin-left: 2px;
}

.workspace {
  display: grid;
  grid-template-columns: 1fr 1px 1fr; /* Use 1px line instead of 60px gap */
  min-height: 600px;
  background: #f8fafc;
  position: relative;
}

.input-section,
.output-section {
  padding: 40px 50px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  transition: background 0.3s ease;
}

.input-section:focus-within {
  background: #f1f5f9;
}

/* Vertical divider line */
.workspace > div:nth-child(2) {
  background: rgba(0, 0, 0, 0.06);
  width: 1px;
  height: 100%;
  position: relative;
}

/* Action button floating on the divider */
.action-bar {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  pointer-events: none; /* Let clicks pass through container */
}

.process-btn {
  pointer-events: auto;
  width: 64px;
  height: 64px;
  border-radius: 50%; /* Back to circle for floating action button feel */
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: #0f172a;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow:
    0 0 0 4px #f8fafc,
    0 10px 30px rgba(15, 23, 42, 0.2);
}

.process-btn:hover:not(:disabled) {
  transform: scale(1.1);
  border-color: #fff;
  box-shadow:
    0 0 0 4px #f8fafc,
    0 15px 35px rgba(15, 23, 42, 0.3);
}

.process-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.process-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #cbd5e1;
  box-shadow: none;
  border-color: transparent;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #64748b;
  font-weight: 600;
}

.char-count {
  font-size: 10px;
  color: #64748b;
  font-family: 'JetBrains Mono', monospace;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
}

textarea {
  flex: 1;
  background: transparent;
  border: none;
  padding: 0;
  resize: none;
  color: #334155;
  font-size: 18px; /* Larger font for readability */
  line-height: 1.7;
  font-family: 'JetBrains Mono', monospace; /* Keep monospace for code/tech feel */
  font-weight: 300;
  outline: none;
  min-height: 300px;
}

textarea::placeholder {
  color: #94a3b8;
}

.output-display {
  flex: 1;
  background: transparent;
  padding: 0;
  overflow-y: auto;
  min-height: 300px;
  font-family: 'JetBrains Mono', monospace;
}

.output-display.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-text {
  white-space: pre-wrap;
  color: #334155;
  font-size: 18px; /* Matching input size */
  line-height: 1.7;
  font-weight: 300;
}

.empty-text {
  color: #94a3b8;
  font-style: italic;
  font-family: 'Playfair Display', serif; /* Elegant serif for placeholder */
  font-size: 16px;
}

.copy-btn {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: #64748b;
  cursor: pointer;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  transition: all 0.2s;
  border-radius: 20px; /* Pill shape */
}

.copy-btn:hover {
  border-color: #0f172a;
  color: #0f172a;
  background: rgba(0, 0, 0, 0.05);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  color: #64748b;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.pulse-ring {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 50%;
  animation: pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
  position: relative;
}

.pulse-ring::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  background: #0f172a;
  border-radius: 50%;
  opacity: 0.2;
}

@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.5;
    box-shadow: 0 0 0 0 rgba(15, 23, 42, 0.2);
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
    box-shadow: 0 0 20px 10px rgba(15, 23, 42, 0);
  }
  100% {
    transform: scale(0.8);
    opacity: 0.5;
    box-shadow: 0 0 0 0 rgba(15, 23, 42, 0);
  }
}

/* Mobile Responsiveness */
@media (max-width: 979px) {
  .translator-page {
    padding: 20px;
    padding-left: 20px;
    align-items: flex-start;
    height: auto;
  }

  .tool-container {
    max-width: 100%;
    margin: 0;
    height: auto;
    min-height: auto;
    box-shadow: none;
    border: none;
    border-radius: 0;
  }

  .header-content {
    flex-direction: column;
    text-align: center;
    gap: 16px;
  }

  .tool-header {
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 30px 20px;
  }

  .back-link {
    width: 100%;
    justify-content: center;
    margin-bottom: 20px;
  }

  .workspace {
    grid-template-columns: 1fr; /* Stack vertically */
    display: flex;
    flex-direction: column;
    background: transparent;
  }

  /* Hide vertical divider on mobile */
  .workspace > div:nth-child(2) {
    display: none;
  }

  .action-bar {
    position: sticky;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: auto;
    height: auto;
    padding: 0;
    margin-top: 20px;
    pointer-events: auto; /* Re-enable clicks */
    z-index: 100;
  }

  .process-btn {
    width: 100%;
    min-width: 200px;
    height: 56px;
    border-radius: 28px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    background: #0f172a;
    color: #fff;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.3);
  }

  .process-btn span::after {
    content: ' Process Text';
    margin-left: 8px;
    font-weight: 600;
  }

  .input-section {
    padding: 20px;
    background: #f8fafc;
    border-radius: 12px;
    margin-bottom: 20px;
  }

  .output-section {
    padding: 20px;
    background: #f8fafc;
    border-radius: 12px;
  }

  textarea {
    min-height: 200px;
    font-size: 16px;
  }

  .output-display {
    min-height: 200px;
    font-size: 16px;
  }

  .control-panel {
    padding: 20px;
    gap: 20px;
  }
}
</style>
