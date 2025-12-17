<template>
  <div class="quantum-page">
    <canvas ref="canvas" class="quantum-canvas"></canvas>

    <div class="overlay">
      <h1>Quantum Connection</h1>
      <p>Entangled forever in space and time</p>
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

// Interaction
const mouse = { x: -1000, y: -1000 }; // Start off screen

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  baseX: number;
  baseY: number;
  density: number;
  canvasWidth: number;
  canvasHeight: number;

  constructor(width: number, height: number) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.size = Math.random() * 3 + 1;
    this.color = '#00f2ff';
    this.baseX = this.x;
    this.baseY = this.y;
    this.density = Math.random() * 30 + 1;
  }

  update(width: number, height: number) {
    this.x += this.vx;
    this.y += this.vy;

    // Boundary check (bounce)
    if (this.x < 0 || this.x > width) this.vx = -this.vx;
    if (this.y < 0 || this.y > height) this.vy = -this.vy;

    // Mouse interaction (Repel)
    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = 150;

    if (distance < maxDistance) {
      const forceDirectionX = dx / distance;
      const forceDirectionY = dy / distance;
      const force = (maxDistance - distance) / maxDistance;
      const directionX = forceDirectionX * force * this.density;
      const directionY = forceDirectionY * force * this.density;

      this.x -= directionX;
      this.y -= directionY;
    } else {
      // Gentle return to original velocity vector if too perturbed?
      // Actually standard movement is fine.
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
}

const handleResize = () => {
  if (!canvas.value) return;
  canvas.value.width = window.innerWidth;
  canvas.value.height = window.innerHeight;
  // We might want to re-init particles here, but for now simple resize is ok
};

const handleMouseMove = (e: MouseEvent) => {
  mouse.x = e.x;
  mouse.y = e.y;
};

const handleTouchMove = (e: TouchEvent) => {
  if (e.touches.length > 0) {
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
  }
};

const handleTouchEnd = () => {
  mouse.x = -1000;
  mouse.y = -1000;
};

onMounted(() => {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;

  canvas.value.width = window.innerWidth;
  canvas.value.height = window.innerHeight;

  const particles: Particle[] = [];
  const numberOfParticles = window.innerWidth < 768 ? 80 : 150; // Fewer particles on mobile

  for (let i = 0; i < numberOfParticles; i++) {
    particles.push(new Particle(canvas.value.width, canvas.value.height));
  }

  const connect = () => {
    for (let a = 0; a < particles.length; a++) {
      for (let b = a; b < particles.length; b++) {
        const dx = particles[a].x - particles[b].x;
        const dy = particles[a].y - particles[b].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 100) {
          const opacityValue = 1 - distance / 100;
          ctx.strokeStyle = 'rgba(0, 242, 255,' + opacityValue + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particles[a].x, particles[a].y);
          ctx.lineTo(particles[b].x, particles[b].y);
          ctx.stroke();
        }
      }
    }
  };

  const animate = () => {
    if (!ctx || !canvas.value) return;
    ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);

    for (let i = 0; i < particles.length; i++) {
      particles[i].update(canvas.value.width, canvas.value.height);
      particles[i].draw(ctx);
    }
    connect();
    animationId = requestAnimationFrame(animate);
  };

  animate();

  window.addEventListener('resize', handleResize);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('touchmove', handleTouchMove);
  window.addEventListener('touchend', handleTouchEnd);
});

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('touchmove', handleTouchMove);
  window.removeEventListener('touchend', handleTouchEnd);
});
</script>

<style scoped>
.quantum-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: radial-gradient(circle, #0d1b2a, #000000);
  touch-action: none; /* Prevent scroll on mobile */
}

.quantum-canvas {
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
  font-size: 3.5rem;
  margin-bottom: 1rem;
  letter-spacing: 5px;
  font-weight: 300;
  text-shadow: 0 0 15px #00f2ff;
}

.overlay p {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  opacity: 0.8;
}

.back-btn {
  pointer-events: auto;
  padding: 10px 30px;
  background: transparent;
  border: 1px solid #00f2ff;
  color: #00f2ff;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  border-radius: 4px;
}

.back-btn:hover {
  background: rgba(0, 242, 255, 0.1);
  box-shadow: 0 0 15px rgba(0, 242, 255, 0.5);
}

@media (max-width: 768px) {
  .overlay h1 {
    font-size: 2rem;
    letter-spacing: 2px;
  }
  .overlay p {
    font-size: 1rem;
  }
}
</style>
