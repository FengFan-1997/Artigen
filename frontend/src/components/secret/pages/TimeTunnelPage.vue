<template>
  <div class="tunnel-page">
    <div id="tunnel-canvas" class="canvas-container"></div>

    <div class="overlay">
      <h1>Time Tunnel</h1>
      <p>Journey to our future</p>
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
let tunnel: THREE.Mesh;
let particles: THREE.Points;

// Interactive variables
let mouseX = 0;
let mouseY = 0;
let speed = 0.02;

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
    speed = 0.05; // Speed up on touch move
  }
};

const onTouchEnd = () => {
  speed = 0.02; // Reset speed
};

onMounted(() => {
  initThree();
  animate();
  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', onTouchEnd);
  if (animationId) cancelAnimationFrame(animationId);
  if (renderer) renderer.dispose();
});

// Custom path for the tunnel
class CustomSinCurve extends THREE.Curve<THREE.Vector3> {
  scale: number;
  constructor(scale = 1) {
    super();
    this.scale = scale;
  }
  getPoint(t: number, optionalTarget = new THREE.Vector3()) {
    const tx = Math.cos(2 * Math.PI * t);
    const ty = Math.sin(2 * Math.PI * t);
    const tz = t * 40; // Length
    return optionalTarget.set(tx, ty, tz).multiplyScalar(this.scale);
  }
}

function initThree() {
  const container = document.getElementById('tunnel-canvas');
  if (!container) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.002);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // Tunnel Geometry
  const path = new CustomSinCurve(10);
  const geometry = new THREE.TubeGeometry(path, 100, 4, 16, false);

  // Shader Material for Warp Effect
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color('#ff00cc') },
      uColor2: { value: new THREE.Color('#3333ff') }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      varying vec2 vUv;

      void main() {
        // Create moving stripes
        float stripes = sin((vUv.x * 30.0) + (uTime * 10.0));
        float stripes2 = cos((vUv.y * 20.0) + (uTime * 5.0));
        
        float strength = stripes * stripes2;
        
        // Neon glow
        vec3 color = mix(uColor1, uColor2, vUv.x + sin(uTime));
        color += strength * 0.8; // More intense
        
        // Grid effect
        float grid = step(0.95, fract(vUv.x * 20.0)) + step(0.95, fract(vUv.y * 10.0));
        color += vec3(grid) * 0.5;

        gl_FragColor = vec4(color, 1.0);
      }
    `
  });

  tunnel = new THREE.Mesh(geometry, material);
  scene.add(tunnel);

  // Particles/Stars - Speed lines
  const particlesGeometry = new THREE.BufferGeometry();
  const particlesCount = 2000;
  const posArray = new Float32Array(particlesCount * 3);
  const randomArray = new Float32Array(particlesCount);

  for (let i = 0; i < particlesCount; i++) {
    posArray[i * 3] = (Math.random() - 0.5) * 50;
    posArray[i * 3 + 1] = (Math.random() - 0.5) * 50;
    posArray[i * 3 + 2] = Math.random() * 400; // Along the length
    randomArray[i] = Math.random();
  }

  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  particlesGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randomArray, 1));

  const particlesMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffffff) }
    },
    vertexShader: `
      uniform float uTime;
      attribute float aRandom;
      varying float vAlpha;
      
      void main() {
        vec3 pos = position;
        
        // Move particles towards camera
        pos.z = mod(pos.z - uTime * 100.0, 400.0);
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = (10.0 * aRandom + 2.0) * (50.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        
        // Fade out as they get close
        vAlpha = smoothstep(0.0, 50.0, pos.z) * smoothstep(400.0, 350.0, pos.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      
      void main() {
        if(length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
        gl_FragColor = vec4(uColor, vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  particles = new THREE.Points(particlesGeometry, particlesMaterial);
  scene.add(particles);
}

const animate = () => {
  animationId = requestAnimationFrame(animate);

  const time = performance.now() * 0.001;

  if (tunnel) {
    (tunnel.material as THREE.ShaderMaterial).uniforms.uTime.value += speed;
    tunnel.rotation.z += 0.005; // Spin tunnel
  }

  if (particles) {
    (particles.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  }

  // Camera shake/movement based on mouse
  camera.position.x += (mouseX * 5 - camera.position.x) * 0.05;
  camera.position.y += (mouseY * 5 - camera.position.y) * 0.05;

  // Move camera through tunnel (simulated by moving tunnel texture and particles)
  // Actually, let's just keep camera mostly static and move world
  camera.position.z = 5;
  camera.lookAt(0, 0, 100);

  renderer.render(scene, camera);
};

const onResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};
</script>

<style scoped>
.tunnel-page {
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
  font-size: 3rem;
  margin-bottom: 1rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 4px;
  text-shadow: 0 0 20px #ff00cc;
  animation: pulse 2s infinite;
}

.overlay p {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  color: #ccc;
}

.back-btn {
  pointer-events: auto;
  padding: 12px 30px;
  background: rgba(255, 0, 204, 0.2);
  border: 2px solid #ff00cc;
  color: #fff;
  font-size: 1rem;
  font-weight: bold;
  letter-spacing: 1px;
  cursor: pointer;
  border-radius: 30px;
  transition: all 0.3s;
  backdrop-filter: blur(5px);
}

.back-btn:hover {
  background: #ff00cc;
  box-shadow: 0 0 30px #ff00cc;
  transform: scale(1.05);
}

@keyframes pulse {
  0%,
  100% {
    text-shadow: 0 0 20px #ff00cc;
    opacity: 1;
  }
  50% {
    text-shadow: 0 0 40px #3333ff;
    opacity: 0.8;
  }
}

@media (max-width: 768px) {
  .overlay h1 {
    font-size: 2rem;
  }
  .overlay p {
    font-size: 1rem;
  }
}
</style>
