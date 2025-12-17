<template>
  <div class="matrix-page">
    <canvas ref="canvas" class="matrix-canvas"></canvas>

    <div class="overlay">
      <h1>Digital Love</h1>
      <p>Decoding our destiny...</p>
      <button class="back-btn" @click="goBack">Return to Garden</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const canvas = ref<HTMLCanvasElement | null>(null);
let animationId: number;

// State
const fontSize = 16;
const drops: number[] = [];

// Interaction
let mouseX = 0;
let mouseY = 0;
let isInteracting = false;

const goBack = () => {
  router.push('/secret-garden');
};

const onMouseMove = (event: MouseEvent) => {
  mouseX = event.clientX;
  mouseY = event.clientY;
  isInteracting = true;
  // Reset interaction flag after a short delay
  setTimeout(() => (isInteracting = false), 100);
};

const onTouchMove = (event: TouchEvent) => {
  if (event.touches.length > 0) {
    mouseX = event.touches[0].clientX;
    mouseY = event.touches[0].clientY;
    isInteracting = true;
    setTimeout(() => (isInteracting = false), 100);
  }
};

const handleResize = () => {
  if (!canvas.value) return;
  canvas.value.width = window.innerWidth;
  canvas.value.height = window.innerHeight;

  const columns = Math.ceil(canvas.value.width / fontSize);
  if (drops.length < columns) {
    for (let i = drops.length; i < columns; i++) {
      drops[i] = Math.floor(Math.random() * -20);
    }
  }
};

onMounted(() => {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  handleResize();

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%LOVE❤️';

  const draw = () => {
    if (!ctx || !canvas.value) return;

    // Translucent black background for trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

    ctx.fillStyle = '#0F0'; // Green text
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#0F0';

    for (let i = 0; i < drops.length; i++) {
      const text = letters.charAt(Math.floor(Math.random() * letters.length));

      // Interaction: if mouse is near, change color or speed
      const x = i * fontSize;
      const y = drops[i] * fontSize;
      const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);

      if (isInteracting && dist < 100) {
        ctx.fillStyle = '#FFF'; // Highlight near touch
        ctx.shadowColor = '#FFF';
        if (Math.random() > 0.5) drops[i] += 2; // Speed up
      } else {
        ctx.fillStyle = '#0F0';
        ctx.shadowColor = '#0F0';
      }

      ctx.fillText(text, x, y);

      if (drops[i] * fontSize > canvas.value.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }

    animationId = requestAnimationFrame(draw);
  };

  draw();

  window.addEventListener('resize', handleResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove);
});

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('touchmove', onTouchMove);
});
</script>

<style scoped>
.matrix-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
  touch-action: none; /* Prevent scroll on mobile */
}

.matrix-canvas {
  display: block;
}

.overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #0f0;
  text-shadow: 0 0 10px #0f0;
  pointer-events: none;
  width: 90%;
}

.overlay h1 {
  font-size: 4rem;
  margin-bottom: 1rem;
  font-family: 'Courier New', Courier, monospace;
}

.overlay p {
  font-size: 1.5rem;
  margin-bottom: 2rem;
  font-family: 'Courier New', Courier, monospace;
}

.back-btn {
  pointer-events: auto;
  padding: 12px 24px;
  background: rgba(0, 255, 0, 0.1);
  border: 2px solid #0f0;
  color: #0f0;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.3s;
  font-family: 'Courier New', Courier, monospace;
  text-transform: uppercase;
  backdrop-filter: blur(2px);
}

.back-btn:hover {
  background: #0f0;
  color: #000;
  box-shadow: 0 0 20px #0f0;
}

@media (max-width: 768px) {
  .overlay h1 {
    font-size: 2.5rem;
  }
  .overlay p {
    font-size: 1rem;
  }
}
</style>
