<template>
  <div class="sakura-page">
    <div id="sakura-canvas" class="canvas-container"></div>

    <div class="overlay">
      <h1>Cherry Blossoms</h1>
      <p>Falling for you</p>
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
let petals: THREE.InstancedMesh;
const count = 1000;
const dummy = new THREE.Object3D();

// Interactive variables
let mouseX = 0;
let windStrength = 0;

const goBack = () => {
  router.push('/secret-garden');
};

const onMouseMove = (event: MouseEvent) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  windStrength = mouseX * 2;
};

const onTouchMove = (event: TouchEvent) => {
  if (event.touches.length > 0) {
    mouseX = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    windStrength = mouseX * 2;
  }
};

onMounted(() => {
  initThree();
  animate();
  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('touchmove', onTouchMove);
  if (animationId) cancelAnimationFrame(animationId);
  if (renderer) renderer.dispose();
});

function initThree() {
  const container = document.getElementById('sakura-canvas');
  if (!container) return;

  scene = new THREE.Scene();
  // Soft pink gradient background via CSS or simple color
  scene.background = new THREE.Color(0xffe6e6); // Very pale pink
  scene.fog = new THREE.FogExp2(0xffe6e6, 0.02);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 5, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  // Petal Shape
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.5, 0.5, 0.5, 1.5, 0, 2);
  shape.bezierCurveTo(-0.5, 1.5, -0.5, 0.5, 0, 0);

  const geometry = new THREE.ShapeGeometry(shape);
  // Center geometry
  geometry.center();

  const material = new THREE.MeshPhongMaterial({
    color: 0xffb7c5, // Sakura pink
    side: THREE.DoubleSide,
    shininess: 30,
    flatShading: false,
    transparent: true,
    opacity: 0.9
  });

  petals = new THREE.InstancedMesh(geometry, material, count);

  // Initialize positions
  for (let i = 0; i < count; i++) {
    resetPetal(i, true);
  }

  scene.add(petals);
}

// Store petal data
const petalData = Array.from({ length: count }, () => ({
  position: new THREE.Vector3(),
  rotation: new THREE.Euler(),
  velocity: new THREE.Vector3(),
  rotationSpeed: new THREE.Vector3(),
  scale: 1
}));

function resetPetal(i: number, initial: boolean = false) {
  const data = petalData[i];

  // Random position in a box above
  data.position.set(
    (Math.random() - 0.5) * 40,
    initial ? Math.random() * 30 : 20 + Math.random() * 10,
    (Math.random() - 0.5) * 30 - 5
  );

  data.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

  data.scale = Math.random() * 0.1 + 0.05;

  // Fall speed
  data.velocity.set(
    (Math.random() - 0.5) * 0.5,
    -(Math.random() * 0.1 + 0.05),
    (Math.random() - 0.5) * 0.5
  );

  data.rotationSpeed.set(
    (Math.random() - 0.5) * 0.1,
    (Math.random() - 0.5) * 0.1,
    (Math.random() - 0.5) * 0.1
  );
}

function animate() {
  animationId = requestAnimationFrame(animate);

  // Interactive Wind
  const targetWind = windStrength * 0.1;

  for (let i = 0; i < count; i++) {
    const data = petalData[i];

    // Update Position
    data.position.x += data.velocity.x + targetWind;
    data.position.y += data.velocity.y;
    data.position.z += data.velocity.z;

    // Turbulence
    data.position.x += Math.sin(Date.now() * 0.001 + i) * 0.01;
    data.position.z += Math.cos(Date.now() * 0.001 + i) * 0.01;

    // Update Rotation
    data.rotation.x += data.rotationSpeed.x;
    data.rotation.y += data.rotationSpeed.y;
    data.rotation.z += data.rotationSpeed.z;

    // Reset if below ground
    if (data.position.y < -5) {
      resetPetal(i);
    }

    // Update Matrix
    dummy.position.copy(data.position);
    dummy.rotation.copy(data.rotation);
    dummy.scale.setScalar(data.scale);
    dummy.updateMatrix();
    petals.setMatrixAt(i, dummy.matrix);
  }

  petals.instanceMatrix.needsUpdate = true;

  // Camera gentle movement
  camera.position.x += (mouseX * 2 - camera.position.x) * 0.05;
  camera.lookAt(0, 5, 0);

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');

.sakura-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(to bottom, #ffe6e6 0%, #ffffff 100%);
}

.canvas-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #ff69b4;
  pointer-events: none;
  z-index: 10;
  width: 90%;
}

h1 {
  font-family: 'Dancing Script', cursive;
  font-size: 4rem;
  margin-bottom: 0.5rem;
  text-shadow: 2px 2px 4px rgba(255, 255, 255, 0.8);
}

p {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.5rem;
  color: #ff8da1;
  margin-bottom: 2rem;
}

.back-btn {
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 182, 193, 0.6);
  color: #ff1493;
  padding: 12px 30px;
  font-size: 1rem;
  border-radius: 30px;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(5px);
  font-weight: 600;
  box-shadow: 0 4px 15px rgba(255, 182, 193, 0.3);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.8);
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 6px 20px rgba(255, 182, 193, 0.5);
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  h1 {
    font-size: 3rem;
  }

  p {
    font-size: 1.2rem;
  }
}
</style>
