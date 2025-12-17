<template>
  <div class="nebula-page">
    <div id="nebula-canvas" class="canvas-container"></div>

    <div class="overlay">
      <h1>Ethereal Nebula</h1>
      <p>Where stars are born</p>
      <button class="back-btn" @click="goBack">Return to Garden</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import * as THREE from 'three';

const router = useRouter();
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let animationId: number;
const cloudParticles: THREE.Mesh[] = [];
let starField: THREE.Points;
let nebulaGroup: THREE.Group;

// Interaction
let mouseX = 0;
let mouseY = 0;
let targetRotationX = 0;
let targetRotationY = 0;

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

function initThree() {
  const container = document.getElementById('nebula-canvas');
  if (!container) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03544e, 0.001);
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.z = 1;
  camera.rotation.x = 1.16;
  camera.rotation.y = -0.12;
  camera.rotation.z = 0.27;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Optimize for mobile
  container.appendChild(renderer.domElement);

  nebulaGroup = new THREE.Group();
  scene.add(nebulaGroup);

  // Lights
  const ambient = new THREE.AmbientLight(0x555555);
  scene.add(ambient);

  const directionalLight = new THREE.DirectionalLight(0xff8c19);
  directionalLight.position.set(0, 0, 1);
  scene.add(directionalLight);

  const orangeLight = new THREE.PointLight(0xcc6600, 50, 450, 1.7);
  orangeLight.position.set(200, 300, 100);
  scene.add(orangeLight);

  const redLight = new THREE.PointLight(0xd8547e, 50, 450, 1.7);
  redLight.position.set(100, 300, 100);
  scene.add(redLight);

  const blueLight = new THREE.PointLight(0x3677ac, 50, 450, 1.7);
  blueLight.position.set(300, 300, 200);
  scene.add(blueLight);

  // Stars
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 2000;
  const posArray = new Float32Array(starsCount * 3);

  for (let i = 0; i < starsCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 2000; // Spread out stars
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  const starsMaterial = new THREE.PointsMaterial({
    size: 2,
    color: 0xffffff,
    transparent: true,
    opacity: 0.8
  });

  starField = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starField);

  // Cloud Texture (Procedural)
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const cloudGeo = new THREE.PlaneGeometry(500, 500);
  const cloudMaterial = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });

  for (let p = 0; p < 50; p++) {
    const cloud = new THREE.Mesh(cloudGeo, cloudMaterial);
    cloud.position.set(Math.random() * 800 - 400, 500, Math.random() * 500 - 500);
    cloud.rotation.x = 1.16;
    cloud.rotation.y = -0.12;
    cloud.rotation.z = Math.random() * 2 * Math.PI;
    (cloud as any).material.opacity = 0.55;
    cloudParticles.push(cloud);
    nebulaGroup.add(cloud);
  }
}

const animate = () => {
  animationId = requestAnimationFrame(animate);

  // Interactive Rotation with damping
  targetRotationX = mouseY * 0.2;
  targetRotationY = mouseX * 0.2;

  nebulaGroup.rotation.x += (targetRotationX - nebulaGroup.rotation.x) * 0.02;
  nebulaGroup.rotation.y += (targetRotationY - nebulaGroup.rotation.y) * 0.02;

  cloudParticles.forEach((p) => {
    p.rotation.z -= 0.001;
  });

  if (starField) {
    starField.rotation.y += 0.0005;
  }

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
  if (renderer) renderer.dispose();
});
</script>

<style scoped>
.nebula-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
  touch-action: none; /* Prevent scroll on mobile for better interaction */
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
  font-family: 'Playfair Display', serif;
  font-style: italic;
  text-shadow: 0 0 15px rgba(255, 255, 255, 0.5);
  background: linear-gradient(to right, #ff8c19, #d8547e, #3677ac);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.overlay p {
  font-size: 1.5rem;
  margin-bottom: 2rem;
  opacity: 0.9;
  letter-spacing: 3px;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
}

.back-btn {
  pointer-events: auto;
  padding: 12px 36px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.4);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.4s ease;
  border-radius: 30px;
  backdrop-filter: blur(5px);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

@media (max-width: 768px) {
  .overlay h1 {
    font-size: 2.5rem;
  }
  .overlay p {
    font-size: 1rem;
    letter-spacing: 1px;
  }
}
</style>
