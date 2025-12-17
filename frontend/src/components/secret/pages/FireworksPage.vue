<template>
  <div class="fireworks-page">
    <canvas ref="canvas" class="fireworks-canvas"></canvas>

    <div class="overlay">
      <h1>Celebration</h1>
      <p>Every moment with you is a festival</p>
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

const goBack = () => {
  router.push('/secret-garden');
};

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
  decay: number;

  constructor(x: number, y: number, color: string, isSparkle = false) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * (isSparkle ? 5 : 3) + 1;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.alpha = 1;
    this.color = color;
    this.size = Math.random() * 2 + 1;
    this.decay = Math.random() * 0.015 + 0.005;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.05; // Gravity
    this.vx *= 0.99; // Air resistance
    this.vy *= 0.99;
    this.alpha -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Firework {
  x: number;
  y: number;
  targetY: number;
  vy: number;
  color: string;
  exploded: boolean;
  particles: Particle[];
  trail: { x: number; y: number }[];

  constructor(canvasHeight: number, canvasWidth: number, targetX?: number, targetY?: number) {
    this.x = targetX ? targetX : Math.random() * canvasWidth;
    this.y = canvasHeight;
    this.targetY = targetY ? targetY : Math.random() * (canvasHeight * 0.5);
    // If targeted, calculate speed to reach height
    if (targetY) {
      this.vy = -Math.sqrt(2 * 0.2 * (canvasHeight - targetY)); // v^2 = 2as approx
    } else {
      this.vy = -(Math.random() * 5 + 10);
    }

    this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    this.exploded = false;
    this.particles = [];
    this.trail = [];
  }

  update() {
    if (!this.exploded) {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 5) this.trail.shift();

      this.y += this.vy;
      this.vy += 0.2; // Gravity acting on rocket

      if (this.vy >= 0 || this.y <= this.targetY) {
        this.explode();
      }
    } else {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        this.particles[i].update();
        if (this.particles[i].alpha <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }
  }

  explode() {
    this.exploded = true;
    const particleCount = 100 + Math.random() * 100;
    const isSparkle = Math.random() > 0.7;
    for (let i = 0; i < particleCount; i++) {
      this.particles.push(new Particle(this.x, this.y, this.color, isSparkle));
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.exploded) {
      ctx.fillStyle = this.color;
      // Draw Rocket
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
      ctx.fill();

      // Draw Trail
      ctx.beginPath();
      if (this.trail.length > 0) {
        ctx.moveTo(this.trail[0].x, this.trail[0].y);
        for (const t of this.trail) ctx.lineTo(t.x, t.y);
      }
      ctx.strokeStyle = `rgba(255,255,255,0.3)`;
      ctx.stroke();
    } else {
      this.particles.forEach((p) => p.draw(ctx));
    }
  }
}

const fireworks: Firework[] = [];

const handleResize = () => {
  if (!canvas.value) return;
  canvas.value.width = window.innerWidth;
  canvas.value.height = window.innerHeight;
};

const handleInteraction = (x: number, y: number) => {
  if (!canvas.value) return;
  // Launch firework to that position
  // Start from bottom center-ish
  const startX = x + (Math.random() - 0.5) * 100;
  const f = new Firework(canvas.value.height, canvas.value.width, x, y);
  f.x = startX; // Override start X
  fireworks.push(f);
};

const onMouseDown = (e: MouseEvent) => {
  handleInteraction(e.clientX, e.clientY);
};

const onTouchStart = (e: TouchEvent) => {
  if (e.touches.length > 0) {
    handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
  }
};

onMounted(() => {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  canvas.value.width = window.innerWidth;
  canvas.value.height = window.innerHeight;

  const animate = () => {
    if (!ctx || !canvas.value) return;

    // Trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

    // Auto launch
    if (Math.random() < 0.03) {
      fireworks.push(new Firework(canvas.value.height, canvas.value.width));
    }

    for (let i = fireworks.length - 1; i >= 0; i--) {
      fireworks[i].update();
      fireworks[i].draw(ctx);
      if (fireworks[i].exploded && fireworks[i].particles.length === 0) {
        fireworks.splice(i, 1);
      }
    }

    animationId = requestAnimationFrame(animate);
  };

  animate();

  window.addEventListener('resize', handleResize);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('touchstart', onTouchStart);
});

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('touchstart', onTouchStart);
});
</script>

<style scoped>
.fireworks-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000; /* Night sky */
  touch-action: none; /* Prevent scroll on mobile */
}

.fireworks-canvas {
  display: block;
}

.overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #fff;
  pointer-events: none;
  width: 90%;
}

.overlay h1 {
  font-size: 4rem;
  margin-bottom: 1rem;
  font-family: 'Brush Script MT', cursive;
  text-shadow: 0 0 20px #ff00de;
}

.overlay p {
  font-size: 1.5rem;
  margin-bottom: 2rem;
  text-shadow: 0 0 10px #00e5ff;
}

.back-btn {
  pointer-events: auto;
  padding: 12px 30px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  border-radius: 25px;
  backdrop-filter: blur(5px);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
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
