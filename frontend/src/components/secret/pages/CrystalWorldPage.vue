<template>
  <div class="crystal-page">
    <div id="crystal-canvas" class="canvas-container"></div>

    <div class="overlay">
      <h1>Prismatic Dreams</h1>
      <p>Love is clarity</p>
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
let crystals: THREE.InstancedMesh;
let backgroundMesh: THREE.Mesh;
const count = 150;
const dummy = new THREE.Object3D();

// Interactive variables
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
  const container = document.getElementById('crystal-canvas');
  if (!container) return;

  scene = new THREE.Scene();
  // Aurora background shader
  const bgGeometry = new THREE.PlaneGeometry(2, 2);
  const bgMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      
      void main() {
        vec2 uv = vUv;
        
        // Aurora colors
        vec3 color1 = vec3(0.1, 0.0, 0.2); // Dark purple
        vec3 color2 = vec3(0.0, 0.1, 0.3); // Dark blue
        vec3 color3 = vec3(0.5, 0.0, 0.5); // Purple
        
        float noise = sin(uv.x * 10.0 + uTime) * sin(uv.y * 10.0 - uTime * 0.5);
        
        vec3 color = mix(color1, color2, uv.y + noise * 0.1);
        color += mix(vec3(0.0), color3, sin(uv.x * 5.0 + uTime * 0.2) * 0.5 + 0.5) * 0.2;
        
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    uniforms: { uTime: { value: 0 } },
    depthWrite: false
  });
  backgroundMesh = new THREE.Mesh(bgGeometry, bgMaterial);
  scene.add(backgroundMesh);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 15);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 4);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const pointLight = new THREE.PointLight(0xff9090, 5);
  pointLight.position.set(-5, -5, 5);
  scene.add(pointLight);

  const blueLight = new THREE.PointLight(0x9090ff, 5);
  blueLight.position.set(5, 5, -5);
  scene.add(blueLight);

  // Crystals
  const geometry = new THREE.OctahedronGeometry(1, 0);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0,
    transmission: 0.95, // Glass-like
    thickness: 1.5,
    ior: 1.5, // Index of Refraction
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    iridescence: 1,
    iridescenceIOR: 1.3,
    attenuationColor: new THREE.Color(0xffffff),
    attenuationDistance: 1
  });

  crystals = new THREE.InstancedMesh(geometry, material, count);

  // Initialize positions
  for (let i = 0; i < count; i++) {
    updateCrystal(i, 0);
  }

  scene.add(crystals);
}

function updateCrystal(i: number, time: number) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const r = 5 + Math.random() * 5;

  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);

  dummy.position.set(x, y, z);
  dummy.rotation.set(
    Math.random() * Math.PI + time * 0.1,
    Math.random() * Math.PI + time * 0.1,
    Math.random() * Math.PI
  );

  const scale = Math.random() * 0.8 + 0.2;
  dummy.scale.setScalar(scale);

  dummy.updateMatrix();
  crystals.setMatrixAt(i, dummy.matrix);
}

// Store initial positions/rotations for animation
const crystalData = Array.from({ length: count }, () => ({
  position: new THREE.Vector3(
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 10
  ),
  rotation: new THREE.Euler(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  ),
  scale: Math.random() * 0.8 + 0.2,
  speed: Math.random() * 0.5 + 0.1
}));

function animate() {
  animationId = requestAnimationFrame(animate);
  const time = performance.now() * 0.001;

  if (backgroundMesh) {
    (backgroundMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  }

  // Interactive Rotation
  targetRotationX = mouseY * 0.5;
  targetRotationY = mouseX * 0.5;

  crystals.rotation.x += (targetRotationX - crystals.rotation.x) * 0.05;
  crystals.rotation.y += (targetRotationY - crystals.rotation.y) * 0.05;

  // Animate individual crystals
  for (let i = 0; i < count; i++) {
    const data = crystalData[i];

    dummy.position.copy(data.position);
    dummy.position.y += Math.sin(time * data.speed + i) * 0.5; // Float effect

    dummy.rotation.copy(data.rotation);
    dummy.rotation.x += time * data.speed * 0.5;
    dummy.rotation.y += time * data.speed * 0.3;

    dummy.scale.setScalar(data.scale);

    dummy.updateMatrix();
    crystals.setMatrixAt(i, dummy.matrix);
  }
  crystals.instanceMatrix.needsUpdate = true;

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');

.crystal-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f0f0f5;
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
  pointer-events: none;
  z-index: 10;
  mix-blend-mode: exclusion;
  width: 90%;
}

h1 {
  font-family: 'Cinzel', serif;
  font-size: 4rem;
  color: #fff;
  margin-bottom: 1rem;
}

p {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.2rem;
  color: #eee;
  margin-bottom: 2rem;
}

.back-btn {
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 12px 30px;
  font-size: 1rem;
  border-radius: 30px;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(5px);
  font-weight: 600;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
  transform: scale(1.05);
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  h1 {
    font-size: 2.5rem;
  }

  p {
    font-size: 1rem;
  }

  .overlay {
    width: 100%;
    padding: 0 20px;
  }
}
</style>
