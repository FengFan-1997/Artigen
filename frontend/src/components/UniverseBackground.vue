<template>
  <canvas ref="canvasRef" class="webgl-canvas"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';

const props = defineProps<{
  mode?: string | number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isMobile = window.innerWidth < 768;

// Three.js Variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let particles: THREE.Points;
let geometry: THREE.BufferGeometry;
let material: THREE.ShaderMaterial;
let animationId: number;
let clock: THREE.Clock;

const mouse = new THREE.Vector2(0, 0);
const targetMouse = new THREE.Vector2(0, 0);

// Interaction State
const isHolding = ref(false);
const clickStartTime = ref(0);
let gatherStrength = 0;
let explodeStrength = 0;
let sizeScale = 1.0;

type ParticleState = 'IDLE' | 'GATHERING' | 'EXPLODING' | 'RETURNING';
let state: ParticleState = 'IDLE';

// Vertex Shader
const vertexShader = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uMouse;
  uniform float uGather;
  uniform float uExplode;
  uniform float uSizeScale;
  uniform float uMode;
  
  attribute float aScale;
  attribute vec3 aRandomness;
  attribute vec3 aColor;
  
  varying vec3 vColor;
  varying float vAlpha;

  // Simplex noise function
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy; 
    vec3 x3 = x0 - D.yyy;      

    // Permutations
    i = mod289(i); 
    vec4 p = permute( permute( permute( 
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    float n_ = 0.142857142857; 
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                  dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    // Apply Size Scale (for re-entry effect)
    vec3 pos = position * uSizeScale;
    
    // Universe drift (Slow rotation)
    float speedMultiplier = 1.0;
    if (uMode > 0.5 && uMode < 1.5) speedMultiplier = 2.0; // Mode 1
    if (uMode > 1.5) speedMultiplier = 0.5; // Mode 2
    
    float angle = uTime * 0.05 * speedMultiplier;
    if (uMode > 1.5) angle = -angle;
    
    float s = sin(angle);
    float c = cos(angle);
    mat3 rotation = mat3(
      c, 0.0, s,
      0.0, 1.0, 0.0,
      -s, 0.0, c
    );
    pos = rotation * pos;

    // Noise Drift - Enhanced for IDLE state interaction
    float noiseFreq = 0.01;
    if (uMode > 0.5) noiseFreq = 0.02;
    
    float noise = snoise(pos * noiseFreq + uTime * 0.1);
    pos += noise * 2.0;
    
    // Mouse Interaction (IDLE state repel/attract subtle effect)
    // Map uMouse (-1 to 1) to approximate world coords
    // View frustum at z=0 is roughly 100 units wide
    vec3 mouseWorld = vec3(uMouse.x * 60.0, uMouse.y * 40.0, 0.0);
    float dist = distance(pos.xy, mouseWorld.xy);
    
    // Subtle "magnetic" pull when moving mouse (IDLE only)
    if (uGather < 0.01 && uExplode < 0.01 && dist < 30.0) {
        vec3 pullDir = normalize(mouseWorld - pos);
        float pullFactor = (30.0 - dist) / 30.0;
        pos += pullDir * pullFactor * 5.0 * sin(uTime * 2.0);
    }

    // Interaction Center (Mouse)
    // Gather towards mouse position instead of center
    vec3 target = mouseWorld;
    
    // GATHER: Interpolate towards target
    // Limit convergence so they don't form a single blinding pixel
    // Add spread at target - SQUARE AREA
    // aRandomness is 0..1, so (aRandomness - 0.5) is -0.5..0.5
    // We want a square area, so we scale x and y independently
    vec3 squareOffset = vec3((aRandomness.x - 0.5) * 80.0, (aRandomness.y - 0.5) * 80.0, 0.0);
    vec3 spreadTarget = target + squareOffset;
    
    // Mode specific gather behavior
    if (uMode > 0.5 && uMode < 1.5) {
       // Mode 1: Spiral gather
       float spiralAngle = uGather * 10.0 + aRandomness.x * 6.28;
       vec3 spiralOffset = vec3(cos(spiralAngle), sin(spiralAngle), 0.0) * (1.0 - uGather) * 50.0;
       spreadTarget += spiralOffset;
    }
    
    vec3 gatherPos = mix(pos, spreadTarget, uGather);
    
    // EXPLODE: Push away from target (mouse) with scattered chaos
    vec3 radialDir = normalize(gatherPos - target);
    if (length(gatherPos - target) < 0.001) radialDir = vec3(0.0, 1.0, 0.0);
    
    // Random direction for scattering effect
    vec3 randomDir = normalize(aRandomness - vec3(0.5));
    
    // Mix radial (fleeing) and random (chaos)
    // Mode 0: Balanced scatter
    // Mode 1: More radial (spiral)
    // Mode 2: More chaotic
    float chaos = 0.6;
    if (uMode > 1.5) chaos = 0.9;
    
    vec3 dir = normalize(mix(radialDir, randomDir, chaos));
    
    // Combine
    // When exploding, we push further out from the gather point
    vec3 finalPos = gatherPos + dir * uExplode * 80.0 * (1.0 + aRandomness.x);

    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Twinkle
    float twinkle = sin(uTime * 2.0 + aRandomness.x * 100.0) * 0.5 + 0.5;
    float dynamicScale = 1.0 + twinkle * 0.5;
    
    // Size attenuation
    gl_PointSize = aScale * uPixelRatio * (400.0 / -mvPosition.z) * dynamicScale;
    
    vColor = aColor;
    
    // Mode specific colors
    if (uMode > 0.5 && uMode < 1.5) {
        // Mode 1: Shift hue/swap channels
        vColor = vColor.gbr;
    }
    if (uMode > 1.5) {
        // Mode 2: Invert or shift
        vColor = vec3(1.0) - vColor;
    }
    
    // Make particles brighter during gather/explode
    vColor += vec3(uGather * 0.2);
    vColor += vec3(uExplode * 0.3);
    
    vAlpha = smoothstep(200.0, 0.0, abs(mvPosition.z)) * (0.15 + twinkle * 0.10);
    vAlpha += uGather * 0.2;
  }
`;

// Fragment Shader
const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float strength = distance(gl_PointCoord, vec2(0.5));
    strength = 1.0 - strength;
    strength = pow(strength, 2.0);
    
    if (strength < 0.01) discard;

    gl_FragColor = vec4(vColor, vAlpha * strength);
  }
`;

const initThree = () => {
  if (!canvasRef.value) return;

  try {
    const canvas = document.createElement('canvas');
    if (
      !window.WebGLRenderingContext ||
      (!canvas.getContext('webgl') && !canvas.getContext('experimental-webgl'))
    ) {
      throw new Error('WebGL not supported');
    }
  } catch (e) {
    console.error(e);
    if (canvasRef.value) canvasRef.value.style.display = 'none';
    return;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#050510');
  scene.fog = new THREE.FogExp2('#050510', 0.002);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 60;

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const particlesCount = isMobile ? 10000 : 40000;
  const positions = new Float32Array(particlesCount * 3);
  const scales = new Float32Array(particlesCount);
  const randomness = new Float32Array(particlesCount * 3);
  const colors = new Float32Array(particlesCount * 3);

  const colorPalette = [
    new THREE.Color('#ffffff'),
    new THREE.Color('#aaddff'),
    new THREE.Color('#ffddaa'),
    new THREE.Color('#ffaaee'),
    new THREE.Color('#38bdf8')
  ];

  for (let i = 0; i < particlesCount; i++) {
    const i3 = i * 3;
    const radius = Math.random() * 100;
    const branchAngle = Math.random() * Math.PI * 2;

    const x = Math.cos(branchAngle) * radius;
    const y = Math.sin(branchAngle) * radius;
    const z = (Math.random() - 0.5) * 50;

    if (Math.random() > 0.5) {
      positions[i3] = (Math.random() - 0.5) * 200;
      positions[i3 + 1] = (Math.random() - 0.5) * 200;
      positions[i3 + 2] = (Math.random() - 0.5) * 200;
    } else {
      positions[i3] = x + (Math.random() - 0.5) * 10;
      positions[i3 + 1] = y + (Math.random() - 0.5) * 10;
      positions[i3 + 2] = z + (Math.random() - 0.5) * 10;
    }

    scales[i] = Math.random();
    randomness[i3] = Math.random();
    randomness[i3 + 1] = Math.random();
    randomness[i3 + 2] = Math.random();

    const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
  }

  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aRandomness', new THREE.BufferAttribute(randomness, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  material = new THREE.ShaderMaterial({
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMouse: { value: new THREE.Vector2() },
      uGather: { value: 0 },
      uExplode: { value: 0 },
      uSizeScale: { value: 1.0 },
      uMode: { value: 0.0 }
    }
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);

  clock = new THREE.Clock();

  // Set initial mode
  if (material && material.uniforms) {
    material.uniforms.uMode.value = parseFloat(props.mode?.toString() || '0');
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('touchstart', onTouchStart);
  window.addEventListener('touchend', onTouchEnd);
};

const animate = () => {
  const elapsedTime = clock.getElapsedTime();

  if (material && material.uniforms) {
    material.uniforms.uTime.value = elapsedTime;

    // Interaction Logic
    const holdDuration = Date.now() - clickStartTime.value;

    if (isHolding.value) {
      if (holdDuration > 1000) {
        state = 'GATHERING';
        // Gather: Slowly increase to 0.95 (limit convergence)
        gatherStrength += 0.00096;
        if (gatherStrength > 0.95) gatherStrength = 0.95;

        // Reset explode if we start gathering again
        explodeStrength = 0;
        // Reset size scale to normal if gathering
        sizeScale = 1.0;
      }
      // If holding but < 1000ms, do nothing (state remains IDLE or whatever it was)
    } else {
      // Not holding
      if (state === 'GATHERING') {
        // Just released -> switch to EXPLODING immediately because we were gathering (implies > 1s)
        state = 'EXPLODING';
      }

      if (state === 'EXPLODING') {
        // Increase explodeStrength rapidly but visible
        explodeStrength += 0.15;

        if (explodeStrength > 20.0) {
          state = 'RETURNING';
          explodeStrength = 0;
          gatherStrength = 0;
          sizeScale = 5.0;
        }
      } else if (state === 'RETURNING') {
        sizeScale -= 0.05;
        if (sizeScale < 1.0) {
          sizeScale = 1.0;
          state = 'IDLE';
        }
      } else {
        // IDLE
        state = 'IDLE';
        // Smoothly return to 0 if we were gathering but aborted (shouldn't happen with new logic, but safe to keep)
        if (gatherStrength > 0) {
          gatherStrength -= 0.05;
          if (gatherStrength < 0) gatherStrength = 0;
        }
        explodeStrength = 0;
        sizeScale = 1.0;
      }
    }

    material.uniforms.uGather.value = gatherStrength;
    material.uniforms.uExplode.value = explodeStrength;
    material.uniforms.uSizeScale.value = sizeScale;
  }

  mouse.x += (targetMouse.x - mouse.x) * 0.05;
  mouse.y += (targetMouse.y - mouse.y) * 0.05;

  if (material && material.uniforms) {
    material.uniforms.uMouse.value.set(mouse.x, mouse.y);
  }

  camera.position.x += (mouse.x * 5 - camera.position.x) * 0.01;
  camera.position.y += (mouse.y * 5 - camera.position.y) * 0.01;
  camera.lookAt(scene.position);

  renderer.render(scene, camera);
  animationId = requestAnimationFrame(animate);
};

const onResize = () => {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
};

const onMouseMove = (event: MouseEvent) => {
  targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
};

const onMouseDown = () => {
  isHolding.value = true;
  clickStartTime.value = Date.now();
};

const onMouseUp = () => {
  isHolding.value = false;
};

const onTouchStart = (event: TouchEvent) => {
  if (event.touches.length > 0) {
    targetMouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
    targetMouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
    isHolding.value = true;
    clickStartTime.value = Date.now();
  }
};

const onTouchEnd = () => {
  isHolding.value = false;
};

const triggerEffect = (_intensity: number = 0.5) => {
  // Optional external trigger
};

defineExpose({ triggerEffect });

// Watch mode changes
watch(
  () => props.mode,
  (newVal) => {
    if (material && material.uniforms) {
      material.uniforms.uMode.value = parseFloat(newVal?.toString() || '0');
    }
  }
);

onMounted(() => {
  initThree();
  animate();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mousedown', onMouseDown);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('touchstart', onTouchStart);
  window.removeEventListener('touchend', onTouchEnd);

  if (renderer) renderer.dispose();
  if (geometry) geometry.dispose();
  if (material) material.dispose();
});
</script>

<style scoped>
.webgl-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
}
</style>
