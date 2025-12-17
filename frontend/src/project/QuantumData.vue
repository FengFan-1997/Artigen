<template>
  <div class="quantum-container" ref="container">
    <div class="hud-overlay">
      <div class="data-stream">
        <div v-for="i in 10" :key="i" class="data-row">
          {{ generateRandomHex() }}
        </div>
      </div>

      <div class="title-block">
        <h1>QUANTUM DATA STREAM</h1>
        <p>PROCESSING {{ (particleCount / 1000).toFixed(0) }}K DATA POINTS</p>
      </div>

      <div class="controls-hint">
        <span>DRAG TO ROTATE</span>
        <span>SCROLL TO ZOOM</span>
      </div>

      <button class="back-btn" @click="goBack">DISCONNECT</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import * as THREE from 'three';

const router = useRouter();
const container = ref<HTMLElement | null>(null);

const particleCount = 100000;
const generateRandomHex = () => {
  return (
    '0x' +
    Math.floor(Math.random() * 16777215)
      .toString(16)
      .toUpperCase()
      .padStart(6, '0')
  );
};

const goBack = () => {
  router.push('/');
};

// Three.js
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let animationId: number;
let particles: THREE.Points;
let mouseX = 0;
let mouseY = 0;

const initScene = () => {
  if (!container.value) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050510);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 100;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.value.appendChild(renderer.domElement);

  // Particles
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  const color1 = new THREE.Color(0x00ffff);
  const color2 = new THREE.Color(0xff00aa);

  for (let i = 0; i < particleCount; i++) {
    // Sphere distribution
    const r = 40 + Math.random() * 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Gradient Color based on position
    const mixedColor = color1.clone().lerp(color2, (y / r + 1) / 2);
    colors[i * 3] = mixedColor.r;
    colors[i * 3 + 1] = mixedColor.g;
    colors[i * 3 + 2] = mixedColor.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);

  // Event Listeners
  window.addEventListener('mousemove', onDocumentMouseMove);
};

const onDocumentMouseMove = (event: MouseEvent) => {
  mouseX = (event.clientX - window.innerWidth / 2) * 0.001;
  mouseY = (event.clientY - window.innerHeight / 2) * 0.001;
};

const animate = () => {
  animationId = requestAnimationFrame(animate);

  const time = Date.now() * 0.001;

  if (particles) {
    particles.rotation.y += 0.05 * (mouseX - particles.rotation.y);
    particles.rotation.x += 0.05 * (mouseY - particles.rotation.x);
    particles.rotation.z += 0.001;

    // Pulse effect
    const scale = 1 + Math.sin(time) * 0.05;
    particles.scale.set(scale, scale, scale);
  }

  renderer.render(scene, camera);
};

const handleResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

onMounted(() => {
  initScene();
  animate();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('mousemove', onDocumentMouseMove);
  cancelAnimationFrame(animationId);
  if (renderer && container.value) {
    container.value.removeChild(renderer.domElement);
    renderer.dispose();
  }
});
</script>

<style scoped>
.quantum-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #050510;
  position: relative;
}

.hud-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  font-family: 'Space Mono', monospace;
  z-index: 10;
}

.data-stream {
  position: absolute;
  top: 20px;
  left: 20px;
  font-size: 0.8rem;
  color: rgba(0, 255, 255, 0.4);
  line-height: 1.2;
}

.title-block {
  position: absolute;
  bottom: 40px;
  left: 40px;
}

h1 {
  font-size: 3rem;
  margin: 0;
  color: #fff;
  letter-spacing: 2px;
}

p {
  margin-top: 5px;
  color: #00ffff;
  font-size: 0.9rem;
}

.controls-hint {
  position: absolute;
  top: 50%;
  right: 40px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: right;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8rem;
}

.back-btn {
  position: absolute;
  top: 40px;
  right: 40px;
  pointer-events: auto;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 10px 20px;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(5px);
}

.back-btn:hover {
  background: #fff;
  color: #000;
}
</style>
