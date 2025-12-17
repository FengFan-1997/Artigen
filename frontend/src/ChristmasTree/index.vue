<template>
  <div class="christmas-tree-container" ref="containerRef">
    <video ref="videoRef" class="input_video" style="display: none"></video>
    <canvas ref="canvasRef" class="output_canvas" style="display: none"></canvas>
    <div v-if="loading" class="loading-overlay">
      <div class="loading-text">Loading Christmas Magic...</div>
    </div>
    <div class="controls">
      <button @click="resetState">Reset</button>
      <label class="upload-btn">
        Upload Photo
        <input type="file" accept="image/*" @change="handleImageUpload" style="display: none" />
      </label>
    </div>
    <div class="instructions">
      <p>✊ Fist: Collapse Tree</p>
      <p>🖐 Open Hand: Scatter</p>
      <p>🤏 Pinch: Grab Photo</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
// @ts-ignore
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
// @ts-ignore
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

const containerRef = ref<HTMLElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const loading = ref(true);

// State
enum AppState {
  COLLAPSED = 'collapsed',
  SCATTERED = 'scattered',
  PHOTO_ZOOM = 'photo_zoom'
}
let currentState = AppState.COLLAPSED;

// Three.js variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let composer: EffectComposer;
let controls: OrbitControls;
let particles: THREE.InstancedMesh;
let cubeParticles: THREE.InstancedMesh;
let photoCloud: THREE.Group;
let clock: THREE.Clock;
let animationId: number;

// Particles data
const PARTICLE_COUNT = 1000;
const CUBE_COUNT = 500;
const dummy = new THREE.Object3D();
const particlePositions: { original: THREE.Vector3; random: THREE.Vector3 }[] = [];
const cubePositions: { original: THREE.Vector3; random: THREE.Vector3 }[] = [];

// Photos
const photos: THREE.Mesh[] = [];
// const textureLoader = new THREE.TextureLoader();

// MediaPipe
let hands: Hands;
let cameraDevice: Camera;

const initThree = () => {
  if (!containerRef.value) return;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x051005); // Dark green background
  scene.fog = new THREE.FogExp2(0x051005, 0.002);

  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 20, 50);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  containerRef.value.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0xffd700, 1, 100); // Gold light
  pointLight.position.set(0, 20, 20);
  scene.add(pointLight);

  // Post-processing (Bloom)
  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85
  );
  bloomPass.threshold = 0.1;
  bloomPass.strength = 1.2; // High glow
  bloomPass.radius = 0.5;

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  // Create Particles (Tree Elements: Spheres, Cubes)
  createParticles();

  // Photo Cloud Group
  photoCloud = new THREE.Group();
  scene.add(photoCloud);

  // Add some default photos (placeholders)
  createPlaceholderPhotos();

  clock = new THREE.Clock();

  // Resize handler
  window.addEventListener('resize', onWindowResize);
};

const createParticles = () => {
  // Spheres
  const geometry = new THREE.SphereGeometry(0.5, 8, 8);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffd700, // Gold
    metalness: 0.8,
    roughness: 0.2
  });

  particles = new THREE.InstancedMesh(geometry, material, PARTICLE_COUNT);

  const color = new THREE.Color();
  const palette = [0xffd700, 0xaa0000, 0x00aa00, 0xffffff]; // Gold, Red, Green, White

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const y = Math.random() * 40;
    const radius = (40 - y) * 0.4 * Math.random();

    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;

    const originalPos = new THREE.Vector3(x, y - 20, z);
    const randomPos = new THREE.Vector3(
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100
    );

    particlePositions.push({ original: originalPos, random: randomPos });

    dummy.position.copy(originalPos);
    dummy.scale.setScalar(Math.random() * 0.5 + 0.5);
    dummy.updateMatrix();
    particles.setMatrixAt(i, dummy.matrix);
    particles.setColorAt(i, color.setHex(palette[Math.floor(Math.random() * palette.length)]));
  }

  particles.instanceMatrix.needsUpdate = true;
  particles.instanceColor!.needsUpdate = true;
  scene.add(particles);

  // Cubes
  const cubeGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const cubeMaterial = new THREE.MeshStandardMaterial({
    metalness: 0.5,
    roughness: 0.1
  });
  cubeParticles = new THREE.InstancedMesh(cubeGeometry, cubeMaterial, CUBE_COUNT);

  for (let i = 0; i < CUBE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const y = Math.random() * 40;
    const radius = (40 - y) * 0.4 * Math.random();

    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;

    const originalPos = new THREE.Vector3(x, y - 20, z);
    const randomPos = new THREE.Vector3(
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100
    );

    cubePositions.push({ original: originalPos, random: randomPos });

    dummy.position.copy(originalPos);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.scale.setScalar(Math.random() * 0.5 + 0.5);
    dummy.updateMatrix();
    cubeParticles.setMatrixAt(i, dummy.matrix);
    cubeParticles.setColorAt(i, color.setHex(palette[Math.floor(Math.random() * palette.length)]));
  }
  cubeParticles.instanceMatrix.needsUpdate = true;
  cubeParticles.instanceColor!.needsUpdate = true;
  scene.add(cubeParticles);
};

const createPlaceholderPhotos = () => {
  // Create a few placeholder planes
  for (let i = 0; i < 5; i++) {
    addPhoto(createTextureText(`Photo ${i + 1}`));
  }
};

const createTextureText = (text: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#aa0000';
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
};

const addPhoto = (texture: THREE.Texture) => {
  const geometry = new THREE.PlaneGeometry(5, 5);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });
  const mesh = new THREE.Mesh(geometry, material);

  // Initial position in cone
  const theta = Math.random() * Math.PI * 2;
  const y = Math.random() * 30 - 10;
  const radius = (30 - (y + 10)) * 0.5;
  mesh.position.set(Math.cos(theta) * radius, y, Math.sin(theta) * radius);

  // Store original and random pos for photos too
  mesh.userData = {
    originalPos: mesh.position.clone(),
    randomPos: new THREE.Vector3(
      (Math.random() - 0.5) * 80,
      (Math.random() - 0.5) * 80,
      (Math.random() - 0.5) * 80
    ),
    isPhoto: true
  };

  photoCloud.add(mesh);
  photos.push(mesh);
};

const handleImageUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const texture = new THREE.Texture(img);
        texture.needsUpdate = true;
        addPhoto(texture);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(input.files[0]);
  }
};

const onWindowResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
};

const initMediaPipe = () => {
  if (!videoRef.value) return;

  hands = new Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  hands.onResults(onResults);

  cameraDevice = new Camera(videoRef.value, {
    onFrame: async () => {
      if (videoRef.value) {
        await hands.send({ image: videoRef.value });
      }
    },
    width: 640,
    height: 480
  });

  cameraDevice.start().then(() => {
    loading.value = false;
  });
};

const onResults = (results: any) => {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;

  const landmarks = results.multiHandLandmarks[0];
  detectGesture(landmarks);
};

const detectGesture = (landmarks: any[]) => {
  // Simple gesture detection logic
  // 0: Wrist, 8: Index tip, 12: Middle tip, 16: Ring tip, 20: Pinky tip
  // 4: Thumb tip

  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  // const middleTip = landmarks[12];
  // const ringTip = landmarks[16];
  // const pinkyTip = landmarks[20];

  // const wrist = landmarks[0];

  // Helper to calculate distance
  const dist = (p1: any, p2: any) =>
    Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));

  // Check if fingers are extended (tip further from wrist than lower joints)
  // Simplified: Distance from wrist
  // const isIndexOpen = dist(indexTip, wrist) > 0.1;
  // const isMiddleOpen = dist(middleTip, wrist) > 0.1;
  // const isRingOpen = dist(ringTip, wrist) > 0.1;
  // const isPinkyOpen = dist(pinkyTip, wrist) > 0.1;

  // Count open fingers (excluding thumb for now)
  let openFingers = 0;
  if (landmarks[8].y < landmarks[6].y) openFingers++; // Using y check for upright hand
  if (landmarks[12].y < landmarks[10].y) openFingers++;
  if (landmarks[16].y < landmarks[14].y) openFingers++;
  if (landmarks[20].y < landmarks[18].y) openFingers++;

  // Fist: 0 or 1 finger open
  // Open Hand: 4 or 5 fingers open

  if (openFingers >= 4) {
    if (currentState !== AppState.SCATTERED && currentState !== AppState.PHOTO_ZOOM) {
      currentState = AppState.SCATTERED;
      console.log('State: SCATTERED');
    }
  } else if (openFingers === 0) {
    if (currentState !== AppState.COLLAPSED) {
      currentState = AppState.COLLAPSED;
      console.log('State: COLLAPSED');
    }
  }

  // Pinch detection (Thumb + Index close)
  if (dist(thumbTip, indexTip) < 0.05) {
    if (currentState === AppState.SCATTERED) {
      currentState = AppState.PHOTO_ZOOM;
      console.log('State: PHOTO ZOOM');
      // Logic to select a specific photo could be based on hand position relative to screen
      // For now, just zoom into the first photo or random
    }
  }

  // Hand rotation/movement for camera
  if (currentState === AppState.SCATTERED) {
    // Map hand x/y to camera rotation
    const handX = landmarks[9].x; // Middle finger knuckle
    const handY = landmarks[9].y;

    // Normalize 0.5 center to -1 to 1
    const targetX = (handX - 0.5) * 2;
    const targetY = (handY - 0.5) * 2;

    // Smoothly interpolate camera position
    camera.position.x += (targetX * 50 - camera.position.x) * 0.05;
    camera.position.y += (targetY * 50 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);
  }
};

const animate = () => {
  animationId = requestAnimationFrame(animate);

  const time = clock.getElapsedTime();

  // Update particles based on state
  const targetAttribute = currentState === AppState.COLLAPSED ? 'original' : 'random';
  const lerpFactor = 0.05;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const targetPos = particlePositions[i][targetAttribute];

    // Get current instance matrix
    particles.getMatrixAt(i, dummy.matrix);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

    // Interpolate position
    dummy.position.lerp(targetPos, lerpFactor);

    // Add some floating motion in scattered state
    if (currentState === AppState.SCATTERED) {
      dummy.position.y += Math.sin(time + i) * 0.02;
    }

    dummy.updateMatrix();
    particles.setMatrixAt(i, dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate = true;

  // Update Cubes
  for (let i = 0; i < CUBE_COUNT; i++) {
    const targetPos = cubePositions[i][targetAttribute];

    cubeParticles.getMatrixAt(i, dummy.matrix);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

    dummy.position.lerp(targetPos, lerpFactor);
    dummy.rotation.x += 0.01;
    dummy.rotation.y += 0.01;

    if (currentState === AppState.SCATTERED) {
      dummy.position.y += Math.sin(time + i) * 0.02;
    }

    dummy.updateMatrix();
    cubeParticles.setMatrixAt(i, dummy.matrix);
  }
  cubeParticles.instanceMatrix.needsUpdate = true;

  // Update Photos
  photos.forEach((photo, i) => {
    const targetPos = (photo.userData as any)[
      currentState === AppState.COLLAPSED ? 'originalPos' : 'randomPos'
    ];

    if (currentState === AppState.PHOTO_ZOOM && i === 0) {
      // Demo: Zoom first photo
      // Move to front of camera
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const target = camera.position.clone().add(camDir.multiplyScalar(10));
      photo.position.lerp(target, 0.1);
      photo.lookAt(camera.position);
    } else {
      photo.position.lerp(targetPos, lerpFactor);
      photo.lookAt(camera.position); // Photos always face camera
    }
  });

  controls.update();
  composer.render();
};

const resetState = () => {
  currentState = AppState.COLLAPSED;
};

onMounted(() => {
  initThree();
  initMediaPipe();
  animate();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onWindowResize);
  if (cameraDevice) cameraDevice.stop();
  if (renderer) renderer.dispose();
  // Cleanup other resources
});
</script>

<style scoped>
.christmas-tree-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background-color: #051005;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  color: #ffd700;
  font-size: 24px;
  z-index: 100;
}

.controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 20px;
  z-index: 10;
}

button,
.upload-btn {
  background: rgba(255, 215, 0, 0.2);
  border: 1px solid #ffd700;
  color: #ffd700;
  padding: 10px 20px;
  cursor: pointer;
  border-radius: 20px;
  font-family: sans-serif;
  text-transform: uppercase;
  letter-spacing: 1px;
  backdrop-filter: blur(5px);
  transition: all 0.3s;
}

button:hover,
.upload-btn:hover {
  background: rgba(255, 215, 0, 0.5);
  box-shadow: 0 0 15px #ffd700;
}

.instructions {
  position: absolute;
  top: 20px;
  right: 20px;
  color: rgba(255, 255, 255, 0.7);
  text-align: right;
  font-family: sans-serif;
  pointer-events: none;
}
</style>
