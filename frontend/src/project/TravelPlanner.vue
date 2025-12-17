<template>
  <div class="page-container">
    <div class="bg-gradient"></div>
    <div class="bg-noise"></div>

    <div class="planner-card">
      <header class="header">
        <div class="header-left">
          <div class="icon-wrapper">
            <i class="fas fa-plane-departure"></i>
          </div>
          <h1 class="title">Wanderlust AI</h1>
        </div>
        <router-link to="/portfolio-home" class="back-link">
          <i class="fas fa-arrow-left"></i> <span>Back</span>
        </router-link>
      </header>

      <div class="content-wrapper">
        <div class="form-section" v-if="!itinerary">
          <div class="form-grid">
            <div class="form-group">
              <label>Destination</label>
              <div class="input-wrapper">
                <i class="fas fa-map-marker-alt input-icon"></i>
                <input v-model="destination" placeholder="e.g. Tokyo, Japan" />
              </div>
            </div>

            <div class="form-group">
              <label>Duration (Days)</label>
              <div class="input-wrapper">
                <i class="fas fa-clock input-icon"></i>
                <input type="number" v-model="duration" min="1" max="14" />
              </div>
            </div>

            <div class="form-group">
              <label>Budget</label>
              <LabelTypeSelect v-model="budgetIndex" :options="budgetOptions" />
            </div>

            <div class="form-group full-width">
              <label>Interests</label>
              <div class="input-wrapper">
                <i class="fas fa-heart input-icon"></i>
                <input v-model="interests" placeholder="e.g. Food, History, Nature, Art" />
              </div>
            </div>
          </div>

          <div class="action-area">
            <button
              class="generate-btn"
              @click="generateItinerary"
              :disabled="isLoading || !destination"
            >
              <span v-if="!isLoading">Plan My Trip</span>
              <span v-else class="loading-text"> Planning <span class="dots">...</span> </span>
            </button>
          </div>
        </div>

        <div class="itinerary-result" v-else>
          <div class="result-header">
            <div class="trip-info">
              <h2>Trip to {{ destination }}</h2>
              <p>{{ duration }} Days &bull; {{ budget }} Budget</p>
            </div>
            <button class="reset-btn" @click="itinerary = null">
              <i class="fas fa-redo"></i> Plan New Trip
            </button>
          </div>

          <div class="timeline-container">
            <div class="timeline">
              <div v-for="(day, index) in itinerary.days" :key="index" class="day-card">
                <div class="day-marker">
                  <span class="day-num">{{ index + 1 }}</span>
                  <span class="day-label">DAY</span>
                </div>
                <div class="day-content">
                  <h3>{{ day.theme }}</h3>
                  <div class="activities-list">
                    <div
                      v-for="(activity, aIdx) in day.activities"
                      :key="aIdx"
                      class="activity-item"
                    >
                      <div class="time-badge">{{ activity.time }}</div>
                      <div class="activity-desc">{{ activity.desc }}</div>
                    </div>
                  </div>
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
import { generateContent } from '../services/aiService';
import LabelTypeSelect from '../Ingredient/utils/LabelTypeSelect.vue';

const destination = ref('');
const duration = ref(3);
const interests = ref('');
const isLoading = ref(false);
const itinerary = ref<any>(null);

const budgetIndex = ref(1);
const budgetOptions = [
  { value: 0, label: 'Budget', gtm: 'budget_low' },
  { value: 1, label: 'Moderate', gtm: 'budget_mid' },
  { value: 2, label: 'Luxury', gtm: 'budget_high' }
];

const budget = computed(() => {
  return budgetOptions[budgetIndex.value].label;
});

const generateItinerary = async () => {
  isLoading.value = true;
  itinerary.value = null;

  const prompt = `
    Role: Expert Travel Planner.
    Task: Create a ${duration.value}-day itinerary for ${destination.value}.
    Style: ${budget.value} budget, focusing on ${interests.value}.
    
    Output format (JSON only, no markdown):
    {
      "days": [
        {
          "theme": "Day Theme (e.g. Historical Dive)",
          "activities": [
            { "time": "Morning", "desc": "Activity description" },
            { "time": "Afternoon", "desc": "Activity description" },
            { "time": "Evening", "desc": "Activity description" }
          ]
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
    // Sometimes AI adds text before/after JSON
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    itinerary.value = JSON.parse(cleanText);
  } catch (e) {
    console.error(e);
    // Fallback Mock
    itinerary.value = {
      days: [
        {
          theme: 'City Exploration',
          activities: [
            { time: 'Morning', desc: 'Visit the central market and try local coffee.' },
            { time: 'Afternoon', desc: 'Walking tour of the historic district.' },
            { time: 'Evening', desc: 'Dinner at a rooftop restaurant with city views.' }
          ]
        },
        {
          theme: 'Nature & Relaxation',
          activities: [
            { time: 'Morning', desc: 'Hike to the viewpoint.' },
            { time: 'Afternoon', desc: 'Picnic in the botanical gardens.' },
            { time: 'Evening', desc: 'Sunset river cruise.' }
          ]
        }
      ]
    };
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');

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
  background: radial-gradient(circle at 30% 80%, #ffffff 0%, #f1f5f9 70%);
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

.planner-card {
  width: 100%;
  max-width: 1000px;
  min-height: 600px;
  max-height: 85vh;
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
  padding: 24px 40px;
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
  font-size: 16px;
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
  flex: 1;
  overflow-y: auto;
  position: relative;
}

/* Form Section */
.form-section {
  padding: 40px;
  max-width: 800px;
  margin: 0 auto;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-bottom: 40px;
}

.full-width {
  grid-column: 1 / -1;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #64748b;
  font-weight: 600;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 16px;
  color: #64748b;
  font-size: 14px;
  pointer-events: none;
}

input {
  width: 100%;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  padding: 16px 16px 16px 44px;
  color: #334155;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  box-sizing: border-box;
  transition: all 0.3s ease;
}

input:focus {
  background: #ffffff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  outline: none;
}

.generate-btn {
  width: 100%;
  padding: 20px;
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

/* Itinerary Result */
.itinerary-result {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.result-header {
  padding: 32px 40px;
  background: #f8fafc;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.trip-info h2 {
  font-family: 'Playfair Display', serif;
  font-size: 28px;
  margin: 0 0 4px 0;
  color: #0f172a;
}

.trip-info p {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #64748b;
}

.reset-btn {
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: #64748b;
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.reset-btn:hover {
  border-color: #0f172a;
  color: #0f172a;
  background: rgba(0, 0, 0, 0.05);
}

.timeline-container {
  flex: 1;
  overflow-y: auto;
  padding: 40px;
}

.timeline {
  max-width: 800px;
  margin: 0 auto;
  position: relative;
  padding-left: 30px;
  border-left: 1px solid rgba(0, 0, 0, 0.1);
}

.day-card {
  position: relative;
  margin-bottom: 60px;
  padding-left: 40px;
}

.day-card:last-child {
  margin-bottom: 0;
}

.day-marker {
  position: absolute;
  left: -46px; /* -30px (padding) - 16px (half width) */
  top: 0;
  width: 32px;
  height: 32px;
  background: #0f172a;
  border: 1px solid #ffffff;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.1);
}

.day-num {
  font-weight: 700;
  color: #ffffff;
  font-size: 12px;
  line-height: 1;
}

.day-label {
  font-size: 6px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

.day-content {
  background: #f8fafc;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  padding: 24px;
  transition: transform 0.3s ease;
}

.day-content:hover {
  background: #f1f5f9;
  transform: translateX(5px);
}

.day-content h3 {
  margin: 0 0 20px 0;
  font-family: 'Playfair Display', serif;
  font-size: 20px;
  color: #0f172a;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  padding-bottom: 12px;
}

.activities-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-item {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.time-badge {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #64748b;
  background: rgba(0, 0, 0, 0.05);
  padding: 4px 8px;
  border-radius: 4px;
  min-width: 80px;
  text-align: center;
}

.activity-desc {
  font-size: 14px;
  line-height: 1.6;
  color: #334155;
}

/* Deep selector for LabelTypeSelect override */
.form-group :deep(.select-trigger) {
  background: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  color: #334155 !important;
  box-shadow: none !important;
}

.form-group :deep(.selected-text) {
  color: #334155 !important;
}

.form-group :deep(.select-arrow) {
  filter: invert(1);
  opacity: 0.4;
}

.form-group :deep(.dropdown-menu) {
  background: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1) !important;
}

.form-group :deep(.dropdown-option) {
  color: #334155 !important;
}

.form-group :deep(.dropdown-option:hover) {
  background: #f1f5f9 !important;
}

.form-group :deep(.dropdown-option.is-selected) {
  background: #eff6ff !important;
  color: #3b82f6 !important;
}

/* Responsive */
@media (max-width: 900px) {
  .page-container {
    padding: 0;
  }

  .planner-card {
    border-radius: 0;
    border: none;
    height: 100vh;
    max-height: none;
  }

  .form-section {
    padding: 24px;
  }

  .form-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .result-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding: 24px;
  }

  .reset-btn {
    width: 100%;
    justify-content: center;
  }

  .timeline-container {
    padding: 24px;
  }

  .timeline {
    padding-left: 20px;
  }

  .day-marker {
    left: -36px;
  }

  .day-card {
    padding-left: 20px;
  }

  .activity-item {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
