<template>
  <div class="blackhole-page">
    <div id="blackhole-canvas" class="canvas-container"></div>

    <div class="overlay">
      <h1>Event Horizon</h1>
      <p>My love for you is infinite</p>
      <button class="back-btn" @click="goBack">Return to Garden</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import * as THREE from 'three';

const router = useRouter();
let animationId: number;

// Three.js variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let blackHole: THREE.Mesh;
let accretionDisk: THREE.Points;

// Interaction
let mouseX = 0;
let mouseY = 0;

const goBack = () => {
  router.push('/secret-garden');
};

const onMouseMove = (event: MouseEvent) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
};

const onTouchMove = (event: TouchEvent) => {
  if (event.touches.length > 0) {
    mouseX = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
  }
};

const initThree = () => {
  const container = document.getElementById('blackhole-canvas');
  if (!container) return;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 18;
  camera.position.y = 5;
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Optimize for mobile
  container.appendChild(renderer.domElement);

  // Black Hole (Sphere)
  const bhGeometry = new THREE.SphereGeometry(3, 64, 64);
  const bhMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  blackHole = new THREE.Mesh(bhGeometry, bhMaterial);
  scene.add(blackHole);

  // Glow behind black hole (lensing approximation)
  const glowGeo = new THREE.CircleGeometry(3.2, 64);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.5
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.lookAt(camera.position); // Always face camera
  blackHole.add(glow); // Add to black hole so it moves with it? Actually better separate or billboard

  // Accretion Disk (Particles)
  const particlesCount = window.innerWidth < 768 ? 40000 : 80000;
  const posArray = new Float32Array(particlesCount * 3);
  const colorsArray = new Float32Array(particlesCount * 3);

  for (let i = 0; i < particlesCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Spiral distribution
    // Inner radius 3.5, outer 15
    const radius = 3.5 + Math.random() * 12;
    const spiralOffset = radius * 0.5; // Twist

    // Flattened disk
    const x = Math.cos(angle + spiralOffset) * radius;
    const z = Math.sin(angle + spiralOffset) * radius;
    const y = (Math.random() - 0.5) * (radius * 0.05); // Very thin

    posArray[i * 3] = x;
    posArray[i * 3 + 1] = y;
    posArray[i * 3 + 2] = z;

    // Color gradient based on distance
    const color = new THREE.Color();
    if (radius < 5)
      color.setHSL(0.08, 1, 0.6); // Bright Orange/Yellow near event horizon
    else if (radius < 9)
      color.setHSL(0.05, 0.9, 0.4); // Red/Orange
    else color.setHSL(0.6, 0.8, 0.1); // Dark Blue/Purple outer

    colorsArray[i * 3] = color.r;
    colorsArray[i * 3 + 1] = color.g;
    colorsArray[i * 3 + 2] = color.b;
  }

  const particlesGeometry = new THREE.BufferGeometry();
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colorsArray, 3));

  const particlesMaterial = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.8
  });

  accretionDisk = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(accretionDisk);
};

const animate = () => {
  animationId = requestAnimationFrame(animate);

  if (accretionDisk) {
    accretionDisk.rotation.y += 0.003;
  }

  // Interactive Camera Movement
  // Orbit around center based on mouse
  const time = Date.now() * 0.0005;
  const radius = 20;

  // Combine auto movement with mouse interaction
  const targetX = Math.sin(time * 0.2 + mouseX * 2) * radius;
  const targetZ = Math.cos(time * 0.2 + mouseX * 2) * radius;
  const targetY = mouseY * 10 + 5;

  camera.position.x += (targetX - camera.position.x) * 0.05;
  camera.position.z += (targetZ - camera.position.z) * 0.05;
  camera.position.y += (targetY - camera.position.y) * 0.05;

  camera.lookAt(0, 0, 0);

  // Update glow to face camera
  // (Simplified: just draw a halo billboard if we had one)

  renderer.render(scene, camera);
};

onMounted(() => {
  initThree();
  animate();
  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove);
});

const onResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

onBeforeUnmount(() => {
  if (animationId) cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('touchmove', onTouchMove);
  if (renderer) {
    renderer.dispose();
    const container = document.getElementById('blackhole-canvas');
    if (container && renderer.domElement) {
      container.removeChild(renderer.domElement);
    }
  }
});
</script>

<style scoped>
.blackhole-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
  touch-action: none; /* Prevent scroll on mobile */
}

.canvas-container {
  width: 100%;
  height: 100%;
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
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 8px;
  background: linear-gradient(45deg, #ffcc00, #ff6600);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 20px rgba(255, 100, 0, 0.3);
}

.overlay p {
  font-size: 1.5rem;
  margin-bottom: 2rem;
  opacity: 0.8;
  letter-spacing: 2px;
}

.back-btn {
  pointer-events: auto;
  padding: 12px 30px;
  background: rgba(255, 100, 0, 0.1);
  border: 1px solid rgba(255, 100, 0, 0.5);
  color: #ffaa00;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.back-btn:hover {
  background: rgba(255, 100, 0, 0.3);
  box-shadow: 0 0 20px rgba(255, 60, 0, 0.5);
  color: #fff;
}

@media (max-width: 768px) {
  .overlay h1 {
    font-size: 2.5rem;
    letter-spacing: 4px;
  }
  .overlay p {
    font-size: 1rem;
  }
}
</style>
