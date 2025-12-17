<template>
  <div class="resume-forge-container">
    <div class="bg-gradient"></div>
    <div class="bg-noise"></div>

    <div class="content-wrapper">
      <div class="header">
        <button class="back-btn" @click="goBack">
          <i class="fas fa-arrow-left"></i>
          <span>Back</span>
        </button>
        <div class="title-group">
          <h1>AI Resume Forge</h1>
          <p class="subtitle">Optimize your CV for the job you want</p>
        </div>
      </div>

      <div class="workspace">
        <div class="glass-panel input-section">
          <div class="input-group">
            <div class="label-row">
              <i class="fas fa-file-alt icon"></i>
              <label>Your Resume</label>
            </div>
            <textarea
              v-model="resumeText"
              placeholder="Paste your resume content here..."
              class="custom-textarea"
            ></textarea>
          </div>

          <div class="input-group">
            <div class="label-row">
              <i class="fas fa-briefcase icon"></i>
              <label>Job Description</label>
            </div>
            <textarea
              v-model="jobDescription"
              placeholder="Paste the job description here..."
              class="custom-textarea"
            ></textarea>
          </div>

          <button
            class="analyze-btn"
            :disabled="isLoading || !resumeText || !jobDescription"
            @click="analyzeResume"
          >
            <span v-if="!isLoading"> <i class="fas fa-magic"></i> Optimize Resume </span>
            <div v-else class="loading-indicator">
              <i class="fas fa-circle-notch fa-spin"></i> Analyzing...
            </div>
          </button>
        </div>

        <div class="glass-panel output-section" :class="{ 'has-result': result }">
          <div v-if="!result && !isLoading" class="empty-state">
            <i class="fas fa-robot"></i>
            <p>Paste your resume and job description to get AI-powered optimization suggestions.</p>
          </div>

          <div v-if="isLoading" class="loading-state">
            <div class="loader-icon">
              <i class="fas fa-cog fa-spin"></i>
            </div>
            <p>Forging your perfect resume...</p>
          </div>

          <div v-if="result" class="result-content">
            <div class="score-card">
              <div class="score-circle-wrapper">
                <svg class="score-svg" viewBox="0 0 100 100">
                  <circle class="score-bg" cx="50" cy="50" r="45"></circle>
                  <circle
                    class="score-progress"
                    cx="50"
                    cy="50"
                    r="45"
                    :stroke-dasharray="283"
                    :stroke-dashoffset="283 - (283 * result.score) / 100"
                    :style="{ stroke: getScoreColor(result.score) }"
                  ></circle>
                </svg>
                <div class="score-text">
                  <span class="score-value">{{ result.score }}</span>
                  <span class="score-label">MATCH</span>
                </div>
              </div>
              <div class="score-details">
                <h3>Analysis Report</h3>
                <p>{{ result.summary }}</p>
              </div>
            </div>

            <div class="recommendations">
              <h3><i class="fas fa-lightbulb"></i> Key Recommendations</h3>
              <ul>
                <li v-for="(rec, index) in result.recommendations" :key="index">
                  <i class="fas fa-check-circle"></i>
                  <span>{{ rec }}</span>
                </li>
              </ul>
            </div>

            <div class="optimized-content">
              <h3><i class="fas fa-pen-fancy"></i> Suggested Profile Summary</h3>
              <div class="content-box">
                {{ result.optimizedProfile }}
                <button class="copy-btn" @click="copyToClipboard(result.optimizedProfile)">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { generateContent } from '../services/aiService';

const router = useRouter();
const resumeText = ref('');
const jobDescription = ref('');
const isLoading = ref(false);
const result = ref<any>(null);

const goBack = () => router.push('/');

const getScoreColor = (score: number) => {
  if (score >= 80) return '#4ade80'; // Green
  if (score >= 60) return '#facc15'; // Yellow
  return '#f87171'; // Red
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  // Optional: Show a toast notification here
};

const analyzeResume = async () => {
  if (!resumeText.value || !jobDescription.value) return;

  isLoading.value = true;
  result.value = null;

  const prompt = `
    Role: Senior Technical Recruiter & ATS Expert.
    Task: Analyze the following resume against the job description.
    
    Resume:
    ${resumeText.value.substring(0, 2000)}

    Job Description:
    ${jobDescription.value.substring(0, 2000)}

    Output format (JSON only, no markdown):
    {
      "score": number (0-100),
      "summary": "Short analysis of fit",
      "recommendations": ["Actionable tip 1", "Actionable tip 2", "Actionable tip 3"],
      "optimizedProfile": "A rewritten professional summary tailored to the job"
    }
  `;

  try {
    const response = await generateContent(prompt);
    let cleanText = response.text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    // Handle potential non-JSON prefix/suffix if API is chatty
    const jsonStart = cleanText.indexOf('{');
    const jsonEnd = cleanText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleanText = cleanText.substring(jsonStart, jsonEnd + 1);
    }
    result.value = JSON.parse(cleanText);
  } catch (e) {
    console.error(e);
    // Mock result on error for demo purposes if API fails
    result.value = {
      score: 75,
      summary: 'Good technical match but lacks specific keywords from the JD.',
      recommendations: [
        "Include 'Vue 3' explicitly in your skills section.",
        "Quantify your achievements (e.g., 'Improved performance by 20%').",
        'Highlight your experience with TypeScript.'
      ],
      optimizedProfile:
        'Senior Frontend Developer with 5+ years of experience specializing in Vue.js and TypeScript. Proven track record of delivering scalable web applications and optimizing performance.'
    };
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');

.resume-forge-container {
  min-height: 100vh;
  color: #fff;
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  position: relative;
  overflow-x: hidden;
}

.bg-gradient {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 70% 20%, #2c1a3a 0%, #000 70%);
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

.content-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  padding: 40px;
  display: flex;
  flex-direction: column;
  height: 100vh;
  box-sizing: border-box;
}

.header {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
  position: relative;
}

.back-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-right: 20px;
  overflow: hidden;
  position: relative;
}

.back-btn span {
  display: none;
  font-size: 14px;
  margin-left: 8px;
}

.back-btn:hover {
  width: 100px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
}

.back-btn:hover span {
  display: inline;
}

.title-group h1 {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
}

.subtitle {
  color: rgba(255, 255, 255, 0.6);
  margin: 5px 0 0;
  font-size: 1rem;
}

.workspace {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  flex: 1;
  min-height: 0; /* Important for scrolling inside flex item */
}

.glass-panel {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
}

.input-section {
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 600;
  font-size: 0.9rem;
}

.icon {
  color: #a5b4fc;
}

.custom-textarea {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 15px;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  line-height: 1.6;
  resize: none;
  transition: all 0.3s ease;
}

.custom-textarea:focus {
  outline: none;
  border-color: rgba(165, 180, 252, 0.5);
  background: rgba(0, 0, 0, 0.5);
  box-shadow: 0 0 20px rgba(165, 180, 252, 0.1);
}

.analyze-btn {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #fff;
  border: none;
  padding: 16px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 10px 30px rgba(79, 70, 229, 0.3);
  margin-top: auto;
}

.analyze-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 15px 40px rgba(79, 70, 229, 0.4);
}

.analyze-btn:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
  box-shadow: none;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  padding: 40px;
}

.empty-state i {
  font-size: 4rem;
  margin-bottom: 20px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #a5b4fc;
}

.loader-icon {
  font-size: 3rem;
  margin-bottom: 20px;
}

.result-content {
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.score-card {
  display: flex;
  align-items: center;
  gap: 30px;
  padding-bottom: 30px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 30px;
}

.score-circle-wrapper {
  position: relative;
  width: 100px;
  height: 100px;
}

.score-svg {
  transform: rotate(-90deg);
  width: 100px;
  height: 100px;
}

.score-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 8;
}

.score-progress {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s ease-out;
}

.score-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.score-value {
  font-size: 24px;
  font-weight: 700;
}

.score-label {
  font-size: 10px;
  opacity: 0.6;
}

.score-details h3 {
  margin: 0 0 10px;
  font-size: 1.2rem;
  color: #fff;
}

.score-details p {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.95rem;
  line-height: 1.5;
}

.recommendations h3,
.optimized-content h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
  margin-bottom: 15px;
  color: #a5b4fc;
}

.recommendations ul {
  list-style: none;
  padding: 0;
  margin: 0 0 30px;
}

.recommendations li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.95rem;
  line-height: 1.5;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px;
  border-radius: 8px;
}

.recommendations li i {
  color: #4ade80;
  margin-top: 4px;
}

.content-box {
  background: rgba(0, 0, 0, 0.3);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.6;
  font-size: 0.95rem;
  position: relative;
}

.copy-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

@media (max-width: 900px) {
  .content-wrapper {
    padding: 20px;
    height: auto;
    min-height: 100vh;
  }

  .workspace {
    grid-template-columns: 1fr;
    height: auto;
    gap: 20px;
  }

  .glass-panel {
    height: auto;
    min-height: 400px;
  }

  .custom-textarea {
    height: 200px;
  }

  .title-group h1 {
    font-size: 1.8rem;
  }
}
</style>
