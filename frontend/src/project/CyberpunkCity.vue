<template>
  <div class="cyberpunk-container" ref="container">
    <div class="ui-overlay">
      <div class="header">
        <h1>CYBERPUNK CITY</h1>
        <div class="status">SYSTEM: ONLINE</div>
      </div>
      <div class="controls">
        <div class="control-item">
          <span class="label">TRAFFIC DENSITY</span>
          <div class="bar-container"><div class="bar" style="width: 75%"></div></div>
        </div>
        <div class="control-item">
          <span class="label">NEON INTENSITY</span>
          <div class="bar-container"><div class="bar" style="width: 90%"></div></div>
        </div>
      </div>
      <button class="back-btn" @click="goBack">EXIT SIMULATION</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import * as THREE from 'three';

const router = useRouter();
const container = ref<HTMLElement | null>(null);

// Three.js variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let animationId: number;
let buildings: THREE.Group;
let cars: THREE.Group;

// Config
const CITY_SIZE = 2000;
const BUILDING_COUNT = 300;
const CAR_COUNT = 200;

const goBack = () => {
  router.push('/');
};

const initScene = () => {
  if (!container.value) return;

  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020210);
  scene.fog = new THREE.FogExp2(0x020210, 0.002);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 3000);
  camera.position.set(0, 150, 400);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.value.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(100, 200, 100);
  scene.add(dirLight);

  // Ground Grid
  const gridHelper = new THREE.GridHelper(CITY_SIZE, 60, 0xff00ff, 0x222244);
  scene.add(gridHelper);

  // Buildings
  buildings = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // Re-use geometry for performance, scale instances
  // Actually, for simplicity and varied materials, let's use separate meshes or InstancedMesh if optimizing
  // We'll use simple meshes for now but optimized geometry sharing

  const buildingMat = new THREE.MeshPhongMaterial({
    color: 0x111111,
    shininess: 100,
    flatShading: true
  });

  const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 });

  for (let i = 0; i < BUILDING_COUNT; i++) {
    const w = 20 + Math.random() * 30;
    const h = 50 + Math.random() * 250;
    const d = 20 + Math.random() * 30;

    const x = (Math.random() - 0.5) * CITY_SIZE * 0.8;
    const z = (Math.random() - 0.5) * CITY_SIZE * 0.8;

    // Avoid center path
    if (Math.abs(x) < 50) continue;

    const mesh = new THREE.Mesh(geometry, buildingMat);
    mesh.position.set(x, h / 2, z);
    mesh.scale.set(w, h, d);
    mesh.updateMatrix();

    // Add edges for neon look
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
    const line = new THREE.LineSegments(edges, edgeMat);
    line.position.copy(mesh.position);

    buildings.add(mesh);
    buildings.add(line);
  }
  scene.add(buildings);

  // Flying Cars (Particles)
  cars = new THREE.Group();
  const carGeo = new THREE.BufferGeometry();
  const carCount = CAR_COUNT;
  const positions = new Float32Array(carCount * 3);
  const colors = new Float32Array(carCount * 3);
  const speeds = [];

  for (let i = 0; i < carCount; i++) {
    const x = (Math.random() - 0.5) * CITY_SIZE;
    const y = 10 + Math.random() * 150;
    const z = (Math.random() - 0.5) * CITY_SIZE;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const color = Math.random() > 0.5 ? new THREE.Color(0xff0055) : new THREE.Color(0x00aaff);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    speeds.push({
      axis: Math.random() > 0.5 ? 'x' : 'z',
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: 2 + Math.random() * 5
    });
  }

  carGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  carGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const carMat = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  });

  const carSystem = new THREE.Points(carGeo, carMat);
  carSystem.userData = { speeds }; // Store speeds in userdata
  cars.add(carSystem);
  scene.add(cars);
};

const animate = () => {
  animationId = requestAnimationFrame(animate);

  const time = Date.now() * 0.0005;

  // Rotate camera slightly
  camera.position.x = Math.sin(time * 0.2) * 500;
  camera.position.z = Math.cos(time * 0.2) * 500;
  camera.lookAt(0, 0, 0);

  // Animate Cars
  if (cars.children.length > 0) {
    const system = cars.children[0] as THREE.Points;
    const positions = system.geometry.attributes.position.array as Float32Array;
    const speeds = system.userData.speeds;

    for (let i = 0; i < CAR_COUNT; i++) {
      const speedData = speeds[i];
      if (speedData.axis === 'x') {
        positions[i * 3] += speedData.speed * speedData.dir;
        if (positions[i * 3] > CITY_SIZE / 2) positions[i * 3] = -CITY_SIZE / 2;
        if (positions[i * 3] < -CITY_SIZE / 2) positions[i * 3] = CITY_SIZE / 2;
      } else {
        positions[i * 3 + 2] += speedData.speed * speedData.dir;
        if (positions[i * 3 + 2] > CITY_SIZE / 2) positions[i * 3 + 2] = -CITY_SIZE / 2;
        if (positions[i * 3 + 2] < -CITY_SIZE / 2) positions[i * 3 + 2] = CITY_SIZE / 2;
      }
    }
    system.geometry.attributes.position.needsUpdate = true;
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
  cancelAnimationFrame(animationId);
  if (renderer && container.value) {
    container.value.removeChild(renderer.domElement);
    renderer.dispose();
  }
});
</script>

<style scoped>
.cyberpunk-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
  position: relative;
}

.ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  padding: 40px;
  box-sizing: border-box;
  font-family: 'Space Mono', monospace;
  color: #00ffff;
  text-shadow: 0 0 10px #00ffff;
}

.header {
  position: absolute;
  top: 40px;
  left: 40px;
}

h1 {
  font-size: 4rem;
  margin: 0;
  letter-spacing: 5px;
  background: linear-gradient(to right, #00ffff, #ff00ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: none;
}

.status {
  margin-top: 10px;
  font-size: 1.2rem;
  color: #ff00ff;
}

.controls {
  position: absolute;
  bottom: 100px;
  left: 40px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.label {
  font-size: 0.8rem;
  opacity: 0.8;
}

.bar-container {
  width: 200px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(0, 255, 255, 0.3);
}

.bar {
  height: 100%;
  background: #00ffff;
  box-shadow: 0 0 10px #00ffff;
}

.back-btn {
  position: absolute;
  top: 40px;
  right: 40px;
  pointer-events: auto;
  background: transparent;
  border: 1px solid #ff00ff;
  color: #ff00ff;
  padding: 10px 30px;
  font-family: 'Space Mono', monospace;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  text-shadow: 0 0 5px #ff00ff;
  box-shadow:
    0 0 5px #ff00ff,
    inset 0 0 5px #ff00ff;
}

.back-btn:hover {
  background: rgba(255, 0, 255, 0.2);
  transform: scale(1.05);
}
</style>
