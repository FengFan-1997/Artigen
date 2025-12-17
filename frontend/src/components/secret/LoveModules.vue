<template>
  <div class="love-modules-container" :class="{ visible: show }">
    <!-- Classic Modules -->
    <div class="modules-grid">
      <!-- Module 1: Music Player -->
      <div class="module-card music-card">
        <div class="card-content">
          <div class="visualizer">
            <div
              class="bar"
              v-for="n in 10"
              :key="n"
              :style="{ animationDelay: `${n * 0.1}s` }"
            ></div>
          </div>
          <div class="track-info">
            <h3>Our Wedding</h3>
            <p>Romantic Piano</p>
          </div>
          <button class="play-btn" @click="togglePlay" :class="{ playing: isPlaying }">
            <span class="icon">{{ isPlaying ? '⏸' : '▶' }}</span>
          </button>
        </div>
      </div>

      <!-- Module 2: Love Letter -->
      <div class="module-card letter-card" @click="openLetter">
        <div class="card-content">
          <div class="icon-wrapper">
            <span class="mail-icon">✉️</span>
            <span class="notification-dot">1</span>
          </div>
          <h3>Secret Letter</h3>
          <p>Click to read</p>
        </div>
      </div>

      <!-- Module 3: Our Journey (Timeline) -->
      <div class="module-card journey-card" @click="openTimeline">
        <div class="card-content">
          <div class="icon-wrapper">
            <span class="journey-icon">🚀</span>
          </div>
          <h3>Our Journey</h3>
          <p>Time together</p>
        </div>
      </div>

      <!-- Module 4: Daily Whisper -->
      <div class="module-card whisper-card" @click="generateWhisper">
        <div class="card-content">
          <div class="whisper-text" v-if="currentWhisper">"{{ currentWhisper }}"</div>
          <div class="click-hint" v-else>Tap for a whisper 💫</div>
        </div>
      </div>
    </div>

    <!-- Universe Portals -->
    <div class="universe-section">
      <h2 class="universe-title">Infinite Dimensions</h2>
      <div class="modules-grid universes-grid">
        <div class="module-card universe-card" @click="router.push('/secret/galaxy')">
          <div class="card-content">
            <div class="icon-wrapper">🌌</div>
            <h3>Galaxy</h3>
            <p>Cosmic Love</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/sea')">
          <div class="card-content">
            <div class="icon-wrapper">🌊</div>
            <h3>Sea of Stars</h3>
            <p>Eternal Flow</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/crystal')">
          <div class="card-content">
            <div class="icon-wrapper">💎</div>
            <h3>Crystal World</h3>
            <p>Pure & Bright</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/fireworks')">
          <div class="card-content">
            <div class="icon-wrapper">🎆</div>
            <h3>Celebration</h3>
            <p>Festive Joy</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/matrix')">
          <div class="card-content">
            <div class="icon-wrapper">💻</div>
            <h3>Digital Rain</h3>
            <p>Code of Love</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/quantum')">
          <div class="card-content">
            <div class="icon-wrapper">⚛️</div>
            <h3>Quantum Field</h3>
            <p>Entanglement</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/blackhole')">
          <div class="card-content">
            <div class="icon-wrapper">🕳️</div>
            <h3>Event Horizon</h3>
            <p>Infinite Gravity</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/tunnel')">
          <div class="card-content">
            <div class="icon-wrapper">🌀</div>
            <h3>Time Tunnel</h3>
            <p>Warp to Future</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/nebula')">
          <div class="card-content">
            <div class="icon-wrapper">☁️</div>
            <h3>Nebula</h3>
            <p>Star Birth</p>
          </div>
        </div>

        <div class="module-card universe-card" @click="router.push('/secret/sakura')">
          <div class="card-content">
            <div class="icon-wrapper">🌸</div>
            <h3>Sakura</h3>
            <p>Falling Blossoms</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <Teleport to="body">
      <Transition name="fade">
        <div class="modal-overlay" v-if="activeModal" @click.self="closeModal">
          <!-- Letter Modal -->
          <div class="modal-content letter-modal" v-if="activeModal === 'letter'">
            <button class="close-btn" @click="closeModal">×</button>
            <div class="paper">
              <h2>My Dearest,</h2>
              <p>
                In this blooming garden, every rose whispers your name.
                <br /><br />
                Just like the gentle breeze that caresses these flowers, your love brings life to my
                world.
                <br /><br />
                FKF & XY, forever entertwined like vines of ivy. 520, 1314.
              </p>
              <p class="sign">Yours,<br />FKF</p>
            </div>
          </div>

          <!-- Timeline Modal -->
          <div class="modal-content timeline-modal" v-if="activeModal === 'timeline'">
            <button class="close-btn" @click="closeModal">×</button>
            <h2>Our Timeline</h2>
            <div class="timeline">
              <div class="timeline-item" v-for="(event, index) in timelineEvents" :key="index">
                <div class="date">{{ event.date }}</div>
                <div class="content">{{ event.title }}</div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

defineProps<{
  show: boolean;
  isPlaying: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-music'): void;
}>();

const activeModal = ref<string | null>(null);
const currentWhisper = ref<string>('');

const whispers = [
  'You are the sun that warms my garden.',
  'Every flower blooms for you.',
  'My heart beats in 520 BPM.',
  "Let's grow old together.",
  'You are my favorite view.',
  "Love is the flower you've got to let grow."
];

const timelineEvents = [
  { date: '2023.05.20', title: 'First Met' },
  { date: '2023.06.01', title: 'First Date' },
  { date: '2023.12.25', title: 'First Christmas' },
  { date: 'Now', title: 'Creating Future' }
];

const togglePlay = () => {
  emit('toggle-music');
};

const openLetter = () => {
  activeModal.value = 'letter';
};

const openTimeline = () => {
  activeModal.value = 'timeline';
};

const closeModal = () => {
  activeModal.value = null;
};

const generateWhisper = () => {
  const randomIndex = Math.floor(Math.random() * whispers.length);
  currentWhisper.value = whispers[randomIndex];
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Dancing+Script:wght@700&family=Playfair+Display:ital,wght@1,700&family=Montserrat:wght@300;500;600&display=swap');

.love-modules-container {
  position: relative;
  margin: 40px 0;
  width: 100%;
  padding: 0 20px;
  box-sizing: border-box;
  opacity: 0;
  transform: translateY(30px);
  transition: all 1s cubic-bezier(0.23, 1, 0.32, 1);
  z-index: 20;
}

.love-modules-container.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.modules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 20px;
  max-width: 900px;
  margin: 0 auto;
}

/* --- Bright / Glassmorphism Theme --- */
.module-card {
  background: rgba(255, 255, 255, 0.65); /* Bright background */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 24px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.4s ease;
  position: relative;
  overflow: hidden;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.1);
}

.module-card:hover {
  transform: translateY(-8px) scale(1.02);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 15px 45px rgba(255, 105, 180, 0.25); /* Pinkish shadow */
  border-color: #fff;
}

.module-card h3 {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.1rem;
  color: #333; /* Dark text */
  margin: 12px 0 6px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.module-card p {
  font-family: 'Montserrat', sans-serif;
  font-size: 0.85rem;
  color: #666; /* Grey text */
  margin: 0;
}

/* Icons */
.icon-wrapper {
  font-size: 2.8rem;
  margin-bottom: 8px;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
}

/* Music Card */
.visualizer {
  display: flex;
  gap: 4px;
  height: 30px;
  align-items: flex-end;
  margin-bottom: 12px;
}

.bar {
  width: 5px;
  height: 100%;
  background: #ff1493; /* Deep Pink */
  border-radius: 4px;
  animation: equalize 1s infinite ease-in-out;
}

.play-btn {
  margin-top: 12px;
  background: #ff69b4;
  border: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(255, 105, 180, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
}

.play-btn:hover {
  background: #ff1493;
  transform: scale(1.1);
}

@keyframes equalize {
  0%,
  100% {
    height: 20%;
  }
  50% {
    height: 100%;
  }
}

/* Notification Dot */
.notification-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  background: #ff0055;
  color: white;
  font-size: 0.75rem;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  font-weight: bold;
}

/* Whisper Card */
.whisper-text {
  font-family: 'Dancing Script', cursive;
  font-size: 1.4rem;
  color: #d63384;
  line-height: 1.5;
}

.universe-section {
  margin-top: 60px;
  text-align: center;
}

.universe-title {
  font-family: 'Great Vibes', cursive;
  font-size: 2.5rem;
  color: #ff1493;
  margin-bottom: 30px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.universes-grid {
  /* Inherits from modules-grid but we can add specific overrides if needed */
}

.universe-card .icon-wrapper {
  font-size: 3.5rem;
  margin-bottom: 15px;
  transition: transform 0.3s;
}

.universe-card:hover .icon-wrapper {
  transform: scale(1.2) rotate(5deg);
}
.click-hint {
  color: #888;
  font-size: 0.9rem;
  font-style: italic;
}

/* --- Modals --- */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(255, 255, 255, 0.9); /* Opaque background for high-end feel */
  backdrop-filter: blur(20px);
  z-index: 9999; /* Highest priority */
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

.modal-content {
  background: transparent;
  width: 100%;
  height: 100%;
  max-width: none;
  padding: 0;
  border-radius: 0;
  position: relative;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.close-btn {
  position: fixed;
  top: 30px;
  right: 30px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(0, 0, 0, 0.1);
  width: 50px;
  height: 50px;
  border-radius: 50%;
  font-size: 2rem;
  color: #333;
  cursor: pointer;
  transition: all 0.3s;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(5px);
}

.close-btn:hover {
  background: #ff69b4;
  color: #fff;
  transform: rotate(90deg);
}

/* Letter Style */
.letter-modal .paper {
  background: #fffaf0; /* Floral white */
  padding: 60px;
  max-width: 800px;
  width: 90%;
  border-radius: 4px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  font-family: 'Playfair Display', serif;
  color: #4a4a4a;
  line-height: 2;
  border: 1px dashed #dbb1bc;
  margin: 80px auto; /* Space for close button */
  position: relative;
}

.letter-modal h2 {
  font-family: 'Great Vibes', cursive;
  font-size: 4rem;
  color: #d63384;
  margin-top: 0;
  margin-bottom: 40px;
  text-align: center;
}

.letter-modal p {
  font-size: 1.5rem;
}

.sign {
  text-align: right;
  margin-top: 50px;
  font-family: 'Great Vibes', cursive;
  font-size: 2.5rem;
  color: #d63384;
}

/* Timeline Style */
.timeline-modal {
  padding-top: 80px; /* Space for close button */
  justify-content: flex-start; /* Start from top */
}

.timeline-modal h2 {
  text-align: center;
  color: #333;
  font-family: 'Great Vibes', cursive;
  font-size: 4rem;
  margin-bottom: 60px;
}

.timeline {
  border-left: 4px solid #ffd1dc;
  padding-left: 40px;
  margin-left: 20px;
  max-width: 600px;
  width: 90%;
  padding-bottom: 50px;
}

.timeline-item {
  position: relative;
  margin-bottom: 50px;
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: -49px; /* Adjust for thicker border and padding */
  top: 5px;
  width: 18px;
  height: 18px;
  background: #ff69b4;
  border-radius: 50%;
  border: 4px solid #fff;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

.timeline-item .date {
  font-size: 1.2rem;
  color: #ff69b4;
  font-weight: 600;
  margin-bottom: 8px;
  font-family: 'Montserrat', sans-serif;
}

.timeline-item .content {
  font-size: 1.5rem;
  color: #333;
  font-family: 'Playfair Display', serif;
}

/* Mobile Adaptation */
@media (max-width: 768px) {
  .modules-grid {
    grid-template-columns: repeat(2, 1fr); /* 2 columns on mobile */
    gap: 15px;
  }

  .module-card {
    min-height: 120px;
    padding: 15px;
  }

  .icon-wrapper {
    font-size: 2rem;
  }

  .module-card h3 {
    font-size: 0.9rem;
  }

  .module-card p {
    font-size: 0.75rem;
  }

  .letter-modal h2 {
    font-size: 2.5rem;
    margin-bottom: 20px;
  }

  .letter-modal p {
    font-size: 1rem;
    line-height: 1.6;
  }

  .timeline-modal h2 {
    font-size: 2.5rem;
    margin-bottom: 30px;
  }

  .timeline-item .content {
    font-size: 1.1rem;
  }

  .close-btn {
    top: 15px;
    right: 15px;
    width: 40px;
    height: 40px;
    font-size: 1.5rem;
    background: rgba(255, 255, 255, 0.8); /* More visible on mobile */
  }

  .letter-modal .paper {
    padding: 25px;
    width: 90%;
    margin-top: 60px;
  }

  .timeline {
    margin-left: 10px;
    padding-left: 30px;
  }

  .timeline-item::before {
    left: -39px; /* Adjusted for new padding */
  }
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
