<template>
  <div class="page-container">
    <div class="bg-gradient"></div>
    <div class="bg-noise"></div>

    <div class="story-container">
      <header class="header">
        <div class="header-left">
          <div class="icon-wrapper">
            <i class="fas fa-book-open"></i>
          </div>
          <h1 class="title">AI Storyteller</h1>
        </div>
        <router-link to="/portfolio-home" class="back-link">
          <i class="fas fa-arrow-left"></i> <span>Back</span>
        </router-link>
      </header>

      <div class="content-wrapper">
        <div class="sidebar">
          <div class="sidebar-content">
            <div class="input-group">
              <label>Genre</label>
              <div class="select-wrapper">
                <LabelTypeSelect v-model="genreValue" :options="genreOptions" />
              </div>
            </div>

            <div class="input-group">
              <label>Theme / Prompt</label>
              <div class="textarea-wrapper">
                <textarea
                  v-model="prompt"
                  placeholder="E.g., A robot discovering emotions..."
                  rows="4"
                ></textarea>
              </div>
            </div>

            <div class="input-group">
              <label>Protagonist Name</label>
              <input type="text" v-model="protagonist" placeholder="Optional" />
            </div>
          </div>

          <div class="action-area">
            <button
              @click="generateStory"
              :disabled="isLoading || !prompt.trim()"
              class="generate-btn"
            >
              <span v-if="!isLoading">Generate Story</span>
              <span v-else class="loading-text"> Weaving Tale <span class="dots">...</span> </span>
            </button>
          </div>
        </div>

        <div class="story-display">
          <div v-if="!story && !isLoading" class="placeholder-state">
            <div class="icon-bg">
              <i class="fas fa-feather-alt"></i>
            </div>
            <p>Your story awaits...</p>
            <span class="sub-placeholder">Enter a prompt to begin the journey</span>
          </div>

          <div v-else class="story-content">
            <div v-if="storyTitle" class="story-title">{{ storyTitle }}</div>
            <div class="story-text" v-html="formattedStory"></div>

            <div v-if="isLoading" class="loading-indicator">
              <div class="quill-pen">
                <i class="fas fa-pen-nib"></i>
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
import { generateContent } from '../services/aiService';
import LabelTypeSelect from '../Ingredient/utils/LabelTypeSelect.vue';

const genreValue = ref(1);
const prompt = ref('');
const protagonist = ref('');
const story = ref('');
const storyTitle = ref('');
const isLoading = ref(false);

const genreOptions = [
  { label: 'Sci-Fi', value: 1, gtm: 'genre_scifi' },
  { label: 'Fantasy', value: 2, gtm: 'genre_fantasy' },
  { label: 'Mystery', value: 3, gtm: 'genre_mystery' },
  { label: 'Horror', value: 4, gtm: 'genre_horror' },
  { label: 'Romance', value: 5, gtm: 'genre_romance' },
  { label: 'Cyberpunk', value: 6, gtm: 'genre_cyberpunk' }
];

const genre = computed(() => {
  const map: Record<number, string> = {
    1: 'Sci-Fi',
    2: 'Fantasy',
    3: 'Mystery',
    4: 'Horror',
    5: 'Romance',
    6: 'Cyberpunk'
  };
  return map[genreValue.value];
});

const formattedStory = computed(() => {
  return story.value.replace(/\n/g, '<br>');
});

const generateStory = async () => {
  if (!prompt.value.trim() || isLoading.value) return;

  isLoading.value = true;
  story.value = '';
  storyTitle.value = '';

  const fullPrompt = `Write a short ${genre.value} story. 
  Theme: ${prompt.value}. 
  ${protagonist.value ? `Protagonist: ${protagonist.value}.` : ''}
  
  Format the output as follows:
  Title: [Story Title]
  [Story Body]`;

  try {
    const response = await generateContent(fullPrompt);

    if (response.error) {
      story.value = `Error: ${response.error}`;
    } else {
      const text = response.text;
      const titleMatch = text.match(/Title:\s*(.*?)(\n|$)/);
      if (titleMatch) {
        storyTitle.value = titleMatch[1].trim();
        story.value = text.replace(titleMatch[0], '').trim();
      } else {
        story.value = text;
      }
    }
  } catch {
    story.value = 'An error occurred while generating the story.';
  }

  isLoading.value = false;
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Merriweather:wght@300;400&display=swap');

.page-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
  box-sizing: border-box;
  font-family: 'Inter', sans-serif;
  color: #334155;
  position: relative;
  overflow: hidden;
  background-color: #f8fafc;
}

/* Backgrounds */
.bg-gradient {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(circle at 50% 10%, #ffffff 0%, #f1f5f9 80%);
  z-index: -2;
}

.bg-noise {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.4;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  z-index: -1;
  pointer-events: none;
  filter: invert(1);
}

.story-container {
  width: 100%;
  max-width: 1200px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  position: relative;
}

.header {
  padding: 24px 32px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ffffff;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-wrapper {
  width: 40px;
  height: 40px;
  background: #f1f5f9;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #334155;
  font-size: 18px;
}

.title {
  margin: 0;
  font-family: 'Playfair Display', serif;
  font-size: 24px;
  font-weight: 400;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.back-link {
  color: #64748b;
  text-decoration: none;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.03);
  transition: all 0.3s ease;
}

.back-link:hover {
  color: #0f172a;
  background: rgba(0, 0, 0, 0.05);
}

.content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 340px;
  background: #f8fafc;
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-content {
  padding: 32px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-group label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #64748b;
  font-weight: 600;
}

.textarea-wrapper,
input[type='text'] {
  width: 100%;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  padding: 16px;
  color: #334155;
  font-family: inherit;
  font-size: 14px;
  box-sizing: border-box;
  transition: all 0.3s ease;
}

textarea {
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
  resize: none;
  color: #334155;
  font-family: inherit;
  font-size: 14px;
  outline: none;
  line-height: 1.5;
}

.textarea-wrapper:focus-within,
input[type='text']:focus {
  background: #ffffff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  outline: none;
}

.action-area {
  padding: 32px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  background: #f1f5f9;
}

.generate-btn {
  width: 100%;
  padding: 18px;
  background: #0f172a;
  color: #ffffff;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-size: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
}

.generate-btn:disabled {
  background: #cbd5e1;
  color: #94a3b8;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.story-display {
  flex: 1;
  padding: 60px;
  overflow-y: auto;
  position: relative;
  scroll-behavior: smooth;
  background: #ffffff;
}

.placeholder-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  gap: 16px;
  text-align: center;
}

.icon-bg {
  font-size: 48px;
  margin-bottom: 8px;
  opacity: 0.2;
}

.placeholder-state p {
  font-family: 'Playfair Display', serif;
  font-size: 24px;
  margin: 0;
  color: #334155;
}

.sub-placeholder {
  font-size: 13px;
  opacity: 0.7;
}

.story-content {
  max-width: 700px;
  margin: 0 auto;
  width: 100%;
  opacity: 0;
  animation: fadeIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.story-title {
  font-family: 'Playfair Display', serif;
  font-size: 36px;
  font-weight: 400;
  margin-bottom: 40px;
  text-align: center;
  color: #0f172a;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.story-text {
  font-family: 'Merriweather', serif;
  font-size: 18px;
  line-height: 1.9;
  color: #334155;
  white-space: pre-wrap;
  text-align: justify;
}

.loading-indicator {
  display: flex;
  justify-content: center;
  margin-top: 40px;
}

.quill-pen {
  font-size: 24px;
  color: #0f172a;
  animation: write 2s infinite ease-in-out;
}

@keyframes write {
  0% {
    transform: rotate(0deg) translate(0, 0);
    opacity: 0.5;
  }
  25% {
    transform: rotate(-10deg) translate(-5px, 5px);
    opacity: 1;
  }
  50% {
    transform: rotate(0deg) translate(0, 0);
    opacity: 0.5;
  }
  75% {
    transform: rotate(10deg) translate(5px, 5px);
    opacity: 1;
  }
  100% {
    transform: rotate(0deg) translate(0, 0);
    opacity: 0.5;
  }
}

/* Deep selector for LabelTypeSelect override */
.select-wrapper :deep(.select-trigger) {
  background: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  color: #334155 !important;
  box-shadow: none !important;
}

.select-wrapper :deep(.selected-text) {
  color: #334155 !important;
}

.select-wrapper :deep(.select-arrow) {
  filter: invert(1);
  opacity: 0.4;
}

.select-wrapper :deep(.dropdown-menu) {
  background: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1) !important;
}

.select-wrapper :deep(.dropdown-option) {
  color: #334155 !important;
}

.select-wrapper :deep(.dropdown-option:hover) {
  background: #f1f5f9 !important;
}

.select-wrapper :deep(.dropdown-option.is-selected) {
  background: #eff6ff !important;
  color: #3b82f6 !important;
}

/* Responsive */
@media (max-width: 900px) {
  .page-container {
    padding: 0;
  }

  .story-container {
    width: 100%;
    height: 100vh;
    border-radius: 0;
    border: none;
    max-width: none;
  }

  .content-wrapper {
    flex-direction: column;
    overflow-y: auto;
  }

  .sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    flex: 0 0 auto;
  }

  .sidebar-content {
    padding: 24px;
    gap: 20px;
  }

  .action-area {
    padding: 20px;
  }

  .story-display {
    padding: 30px 20px;
    height: auto;
    min-height: 400px;
  }

  .story-title {
    font-size: 28px;
  }

  .story-text {
    font-size: 16px;
  }
}
</style>
