<template>
  <div ref="container" class="hero-interactive" @click="handleClick"></div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as THREE from 'three';
import gsap from 'gsap';

const container = ref<HTMLElement | null>(null);
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let animationId: number;
let core: THREE.Group;
let time = 0;

const mouse = new THREE.Vector2();
const targetRotation = new THREE.Vector2();

const handleMouseMove = (event: MouseEvent) => {
  // Normalize mouse coordinates to -1 to 1
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
};

const handleClick = () => {
  if (!core) return;

  // Burst effect
  gsap.to(core.scale, {
    x: 1.5,
    y: 1.5,
    z: 1.5,
    duration: 0.1,
    yoyo: true,
    repeat: 1,
    ease: 'power2.out'
  });

  // Rapid spin
  gsap.to(core.rotation, {
    y: core.rotation.y + Math.PI * 2,
    duration: 1,
    ease: 'elastic.out(1, 0.3)'
  });

  // Color flash (requires accessing material)
  // For now, just the physical motion is good feedback
};

const init = () => {
  if (!container.value) return;

  // Scene setup
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100); // Aspect ratio will be set on resize
  camera.position.z = 4;

  // Renderer
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(300, 300); // Fixed size for the component
  container.value.appendChild(renderer.domElement);

  // Core Group
  core = new THREE.Group();
  scene.add(core);

  // Inner Core (Icosahedron)
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshNormalMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.5
  });
  const innerCore = new THREE.Mesh(geometry, material);
  core.add(innerCore);

  // Outer Shell (Points)
  const particlesGeometry = new THREE.BufferGeometry();
  const particleCount = 200;
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const r = 1.5 + Math.random() * 0.5;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const particlesMaterial = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.05,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
  });

  const particles = new THREE.Points(particlesGeometry, particlesMaterial);
  core.add(particles);

  // Glow Sprite
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  }

  const spriteMaterial = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending
  });
  const glow = new THREE.Sprite(spriteMaterial);
  glow.scale.set(4, 4, 1);
  scene.add(glow);

  // Light
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0x38bdf8, 2);
  pointLight.position.set(2, 2, 2);
  scene.add(pointLight);

  window.addEventListener('mousemove', handleMouseMove);
};

const animate = () => {
  time += 0.01;

  if (core) {
    // Rotation
    core.rotation.x += 0.005;
    core.rotation.y += 0.01;

    // Mouse interaction
    targetRotation.x = mouse.y * 0.5;
    targetRotation.y = mouse.x * 0.5;

    core.rotation.x += (targetRotation.x - core.rotation.x) * 0.05;
    core.rotation.y += (targetRotation.y - core.rotation.y) * 0.05;

    // Pulsing effect
    const scale = 1 + Math.sin(time * 2) * 0.1;
    core.scale.set(scale, scale, scale);
  }

  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
};

onMounted(() => {
  init();
  animate();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('mousemove', handleMouseMove);
  if (renderer) {
    renderer.dispose();
  }
});
</script>

<style scoped>
.hero-interactive {
  width: 300px;
  height: 300px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background: radial-gradient(circle at center, rgba(56, 189, 248, 0.1) 0%, transparent 70%);
  border-radius: 50%;
  border: 1px solid rgba(56, 189, 248, 0.2);
  box-shadow: 0 0 50px rgba(56, 189, 248, 0.1);
  margin: 40px auto;
  backdrop-filter: blur(5px);
}

.hero-interactive::before {
  content: '';
  position: absolute;
  top: -10px;
  left: -10px;
  right: -10px;
  bottom: -10px;
  border: 1px dashed rgba(56, 189, 248, 0.3);
  border-radius: 50%;
  animation: spin 20s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
