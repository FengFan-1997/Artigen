<template>
  <div class="neural-container">
    <canvas ref="canvas" class="visualizer"></canvas>

    <div class="interface">
      <div class="top-bar">
        <div class="ai-status">
          <div class="pulse-dot"></div>
          <span>NEURAL ENGINE V2.5: ACTIVE</span>
        </div>
        <div class="metrics">
          <span>CPU: 42%</span>
          <span>MEM: 12GB</span>
          <span>LATENCY: 4ms</span>
        </div>
      </div>

      <div class="center-text">
        <h2>EMOTION ANALYSIS</h2>
        <div class="scrolling-data">
          DETECTING PATTERNS...<br />
          SYNCING AUDIO WAVES...<br />
          GENERATING HARMONICS...
        </div>
      </div>

      <button class="back-btn" @click="goBack">TERMINATE SESSION</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const canvas = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number;
let width = 0;
let height = 0;
let time = 0;

const goBack = () => {
  router.push('/');
};

// Particles for background
interface Particle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  alpha: number;
}
const particles: Particle[] = [];

const initParticles = () => {
  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2 + 1,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      alpha: Math.random() * 0.5 + 0.1
    });
  }
};

const drawWave = (
  yOffset: number,
  amplitude: number,
  frequency: number,
  color: string,
  speed: number
) => {
  if (!ctx) return;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);

  for (let x = 0; x < width; x++) {
    const y =
      Math.sin(x * frequency + time * speed) * amplitude * Math.sin(time * 0.5 + x * 0.01) +
      yOffset;
    ctx.lineTo(x, y);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
};

const animate = () => {
  if (!ctx || !canvas.value) return;

  ctx.fillStyle = 'rgba(10, 10, 15, 0.2)'; // Trail effect
  ctx.fillRect(0, 0, width, height);

  time += 0.05;

  // Draw Particles
  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0) p.x = width;
    if (p.x > width) p.x = 0;
    if (p.y < 0) p.y = height;
    if (p.y > height) p.y = 0;

    ctx!.beginPath();
    ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx!.fillStyle = `rgba(100, 200, 255, ${p.alpha})`;
    ctx!.fill();
  });

  // Draw Waves (Neural Activity)
  const centerY = height / 2;

  // Base wave
  drawWave(centerY, 50, 0.01, 'rgba(0, 255, 200, 0.5)', 1);
  drawWave(centerY, 70, 0.005, 'rgba(0, 150, 255, 0.3)', 0.5);
  drawWave(centerY, 30, 0.02, 'rgba(255, 0, 200, 0.4)', 2);

  // Interference lines
  if (Math.random() > 0.95) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(0, Math.random() * height, width, 2);
  }

  animationId = requestAnimationFrame(animate);
};

const handleResize = () => {
  if (canvas.value) {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.value.width = width;
    canvas.value.height = height;
  }
};

onMounted(() => {
  if (canvas.value) {
    ctx = canvas.value.getContext('2d');
    handleResize();
    initParticles();
    animate();
    window.addEventListener('resize', handleResize);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  cancelAnimationFrame(animationId);
});
</script>

<style scoped>
.neural-container {
  width: 100vw;
  height: 100vh;
  background: #0a0a0f;
  position: relative;
  overflow: hidden;
  font-family: 'Space Mono', monospace;
}

.visualizer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.interface {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 40px;
  box-sizing: border-box;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  color: #00ffcc;
  font-size: 0.9rem;
  border-bottom: 1px solid rgba(0, 255, 204, 0.3);
  padding-bottom: 20px;
}

.ai-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  background: #00ffcc;
  border-radius: 50%;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.5);
    opacity: 0.5;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.metrics {
  display: flex;
  gap: 20px;
}

.center-text {
  text-align: center;
  color: #fff;
}

h2 {
  font-size: 3rem;
  letter-spacing: 10px;
  font-weight: 300;
  margin-bottom: 20px;
  text-shadow: 0 0 20px rgba(0, 255, 204, 0.5);
}

.scrolling-data {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.5;
}

.back-btn {
  align-self: flex-end;
  pointer-events: auto;
  background: transparent;
  border: 1px solid #00ffcc;
  color: #00ffcc;
  padding: 15px 40px;
  font-family: 'Space Mono', monospace;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.back-btn:hover {
  background: #00ffcc;
  color: #000;
  box-shadow: 0 0 20px #00ffcc;
}
</style>
