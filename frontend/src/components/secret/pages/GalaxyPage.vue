<template>
  <div class="galaxy-page">
    <div id="galaxy-canvas" class="canvas-container"></div>

    <div class="overlay">
      <h1>Cosmic Love</h1>
      <p>You are my universe</p>
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
let particles: THREE.Points;
let material: THREE.ShaderMaterial;
let starField: THREE.Points;

const parameters = {
  count: window.innerWidth < 768 ? 40000 : 100000,
  size: 0.015,
  radius: 5,
  branches: 3,
  spin: 1,
  randomness: 0.2,
  randomnessPower: 3,
  insideColor: '#ff6030',
  outsideColor: '#1b3984'
};

const goBack = () => {
  router.push('/secret-garden');
};

function initThree() {
  const container = document.getElementById('galaxy-canvas');
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 3, 5);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Galaxy Geometry
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(parameters.count * 3);
  const colors = new Float32Array(parameters.count * 3);
  const scales = new Float32Array(parameters.count * 1);

  const colorInside = new THREE.Color(parameters.insideColor);
  const colorOutside = new THREE.Color(parameters.outsideColor);

  for (let i = 0; i < parameters.count; i++) {
    const i3 = i * 3;

    // Position
    const radius = Math.random() * parameters.radius;
    const spinAngle = radius * parameters.spin;
    const branchAngle = ((i % parameters.branches) / parameters.branches) * Math.PI * 2;

    const randomX =
      Math.pow(Math.random(), parameters.randomnessPower) *
      (Math.random() < 0.5 ? 1 : -1) *
      parameters.randomness *
      radius;
    const randomY =
      Math.pow(Math.random(), parameters.randomnessPower) *
      (Math.random() < 0.5 ? 1 : -1) *
      parameters.randomness *
      radius;
    const randomZ =
      Math.pow(Math.random(), parameters.randomnessPower) *
      (Math.random() < 0.5 ? 1 : -1) *
      parameters.randomness *
      radius;

    positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
    positions[i3 + 1] = randomY;
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

    // Color
    const mixedColor = colorInside.clone();
    mixedColor.lerp(colorOutside, radius / parameters.radius);

    colors[i3] = mixedColor.r;
    colors[i3 + 1] = mixedColor.g;
    colors[i3 + 2] = mixedColor.b;

    // Scale
    scales[i] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  // Shader Material
  material = new THREE.ShaderMaterial({
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 30 * renderer.getPixelRatio() }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uSize;
      attribute float aScale;
      varying vec3 vColor;
      
      void main() {
        vec4 modelPosition = modelMatrix * vec4(position, 1.0);
        
        // Spin animation
        float angle = atan(modelPosition.x, modelPosition.z);
        float distanceToCenter = length(modelPosition.xz);
        float angleOffset = (1.0 / distanceToCenter) * uTime * 0.2;
        angle += angleOffset;
        
        modelPosition.x = cos(angle) * distanceToCenter;
        modelPosition.z = sin(angle) * distanceToCenter;
        modelPosition.y += sin(uTime + distanceToCenter) * 0.1; // Wave motion

        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectionPosition = projectionMatrix * viewPosition;

        gl_Position = projectionPosition;
        gl_PointSize = uSize * aScale;
        gl_PointSize *= (1.0 / -viewPosition.z);

        vColor = color;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        // Light point pattern
        float strength = distance(gl_PointCoord, vec2(0.5));
        strength = 1.0 - strength;
        strength = pow(strength, 10.0);

        vec3 color = mix(vec3(0.0), vColor, strength);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);

  // Starfield Background
  const starGeo = new THREE.BufferGeometry();
  const starCount = 2000;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 50;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 50;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.05,
    transparent: true,
    opacity: 0.8
  });
  starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);
}

// Mouse/Touch Interaction
let mouseX = 0;
let mouseY = 0;
let targetRotationX = 0;
let targetRotationY = 0;

const onMouseMove = (event: MouseEvent) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
};

const onTouchMove = (event: TouchEvent) => {
  if (event.touches.length > 0) {
    mouseX = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
    event.preventDefault(); // Prevent scrolling on touch
  }
};

const animate = () => {
  animationId = requestAnimationFrame(animate);

  if (material) {
    material.uniforms.uTime.value += 0.01;
  }

  // Smooth Rotation
  targetRotationX = mouseY * 0.5;
  targetRotationY = mouseX * 0.5;

  if (scene) {
    // Auto rotation
    scene.rotation.y += 0.0005;

    // Interactive rotation (damping)
    scene.rotation.x += (targetRotationX - scene.rotation.x) * 0.05;
    scene.rotation.z += (targetRotationY - scene.rotation.z) * 0.05;
  }

  // Starfield parallax
  if (starField) {
    starField.rotation.y -= 0.0002;
  }

  renderer.render(scene, camera);
};

const onResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Update particle count for resize if needed, but usually not necessary for performance
  if (material) {
    material.uniforms.uSize.value = 30 * renderer.getPixelRatio();
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
  if (particles) {
    particles.geometry.dispose();
    material.dispose();
  }
  if (starField) {
    starField.geometry.dispose();
    (starField.material as THREE.Material).dispose();
  }
});
</script>

<style scoped>
.galaxy-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
  touch-action: none;
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
  max-width: 600px;
}

.overlay h1 {
  font-size: 3.5rem;
  margin-bottom: 1rem;
  font-family: 'Montserrat', sans-serif;
  text-transform: uppercase;
  letter-spacing: 4px;
  background: linear-gradient(to right, #ff6030, #1b3984);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.overlay p {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  font-family: 'Montserrat', sans-serif;
  opacity: 0.8;
}

.back-btn {
  pointer-events: auto;
  padding: 12px 30px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  border-radius: 30px;
  backdrop-filter: blur(4px);
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

@media (max-width: 768px) {
  .overlay h1 {
    font-size: 2.5rem;
  }
}
</style>
