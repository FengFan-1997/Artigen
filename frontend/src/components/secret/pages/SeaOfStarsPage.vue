<template>
  <div class="sea-page">
    <div id="sea-canvas" class="canvas-container"></div>

    <div class="overlay">
      <h1>Sea of Stars</h1>
      <p>Reflecting our infinite dreams</p>
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
let water: THREE.Mesh;
let stars: THREE.Points;

// Interactive variables
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;

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
  const container = document.getElementById('sea-canvas');
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020205);
  scene.fog = new THREE.FogExp2(0x020205, 0.02);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, -10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // --- Water Plane ---
  const waterGeometry = new THREE.PlaneGeometry(100, 100, 256, 256);
  waterGeometry.rotateX(-Math.PI / 2);

  const waterMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      uniform float uTime;
      uniform float uBigWavesElevation;
      uniform vec2 uBigWavesFrequency;
      uniform float uBigWavesSpeed;
      
      varying float vElevation;
      varying vec2 vUv;

      // Classic Perlin Noise
      vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
      vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

      float cnoise(vec3 P){
        vec3 Pi0 = floor(P);
        vec3 Pi1 = Pi0 + vec3(1.0);
        Pi0 = mod(Pi0, 289.0);
        Pi1 = mod(Pi1, 289.0);
        vec3 Pf0 = fract(P);
        vec3 Pf1 = Pf0 - vec3(1.0);
        vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
        vec4 iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y);
        vec4 iz0 = Pi0.zzzz;
        vec4 iz1 = Pi1.zzzz;
        vec4 ixy = permute(permute(ix) + iy);
        vec4 ixy0 = permute(ixy + iz0);
        vec4 ixy1 = permute(ixy + iz1);
        vec4 gx0 = ixy0 / 7.0;
        vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
        gx0 = fract(gx0);
        vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
        vec4 sz0 = step(gz0, vec4(0.0));
        gx0 -= sz0 * (step(0.0, gx0) - 0.5);
        gy0 -= sz0 * (step(0.0, gy0) - 0.5);
        vec4 gx1 = ixy1 / 7.0;
        vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
        gx1 = fract(gx1);
        vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
        vec4 sz1 = step(gz1, vec4(0.0));
        gx1 -= sz1 * (step(0.0, gx1) - 0.5);
        gy1 -= sz1 * (step(0.0, gy1) - 0.5);
        vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
        vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
        vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
        vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
        vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
        vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
        vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
        vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
        vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
        g000 *= norm0.x;
        g010 *= norm0.y;
        g100 *= norm0.z;
        g110 *= norm0.w;
        vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
        g001 *= norm1.x;
        g011 *= norm1.y;
        g101 *= norm1.z;
        g111 *= norm1.w;
        float n000 = dot(g000, Pf0);
        float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
        float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
        float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
        float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
        float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
        float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
        float n111 = dot(g111, Pf1);
        vec3 fade_xyz = fade(Pf0);
        vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
        vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
        float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
        return 2.2 * n_xyz;
      }

      void main() {
        vUv = uv;
        vec3 pos = position;
        
        float elevation = cnoise(vec3(pos.x * uBigWavesFrequency.x + uTime * uBigWavesSpeed, pos.z * uBigWavesFrequency.y, 0.0)) * uBigWavesElevation;
        
        // Add small waves details
        for(float i = 1.0; i <= 3.0; i++) {
          elevation -= abs(cnoise(vec3(pos.x * 3.0 * i, pos.z * 3.0 * i, uTime * 3.0)) * 0.15 / i);
        }
        
        pos.y += elevation;
        vElevation = elevation;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      varying float vElevation;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uDepthColor;
      uniform vec3 uSurfaceColor;
      uniform float uColorOffset;
      uniform float uColorMultiplier;

      void main() {
        float mixStrength = (vElevation + uColorOffset) * uColorMultiplier;
        vec3 color = mix(uDepthColor, uSurfaceColor, mixStrength);
        
        // Glitter/Star reflections
        float glitter = sin(vUv.x * 150.0 + uTime * 2.0) * sin(vUv.y * 150.0 + uTime * 2.0);
        if (glitter > 0.9) {
            color += vec3(0.6, 0.8, 1.0) * (glitter - 0.9) * 10.0;
        }
        
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    uniforms: {
      uTime: { value: 0 },
      uBigWavesElevation: { value: 0.2 },
      uBigWavesFrequency: { value: new THREE.Vector2(0.4, 0.2) },
      uBigWavesSpeed: { value: 0.75 },
      uDepthColor: { value: new THREE.Color(0x050510) },
      uSurfaceColor: { value: new THREE.Color(0x186691) },
      uColorOffset: { value: 0.2 },
      uColorMultiplier: { value: 4.0 }
    },
    wireframe: false
  });

  water = new THREE.Mesh(waterGeometry, waterMaterial);
  scene.add(water);

  // --- Floating Stars ---
  const starCount = 3000;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starRandom = new Float32Array(starCount);
  const starColors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 100;
    starPos[i * 3 + 1] = Math.random() * 30 + 1;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 80 - 10;
    starRandom[i] = Math.random();

    // Random star colors
    const colorType = Math.random();
    if (colorType > 0.8) {
      starColors[i * 3] = 0.5;
      starColors[i * 3 + 1] = 0.8;
      starColors[i * 3 + 2] = 1.0; // Blueish
    } else if (colorType > 0.6) {
      starColors[i * 3] = 1.0;
      starColors[i * 3 + 1] = 0.8;
      starColors[i * 3 + 2] = 0.8; // Reddish
    } else {
      starColors[i * 3] = 1.0;
      starColors[i * 3 + 1] = 1.0;
      starColors[i * 3 + 2] = 1.0; // White
    }
  }

  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aRandom', new THREE.BufferAttribute(starRandom, 1));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

  const starMat = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float aRandom;
      attribute vec3 color;
      uniform float uTime;
      varying float vAlpha;
      varying vec3 vColor;
      
      void main() {
        vec3 pos = position;
        pos.y += sin(uTime + aRandom * 10.0) * 0.5; // Float
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = (4.0 * aRandom + 2.0) * (20.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        
        vAlpha = 0.5 + 0.5 * sin(uTime * 3.0 + aRandom * 20.0);
        vColor = color;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        if(length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
        gl_FragColor = vec4(vColor, vAlpha);
      }
    `,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  const time = performance.now() * 0.001;

  if (water) (water.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
  if (stars) (stars.material as THREE.ShaderMaterial).uniforms.uTime.value = time;

  // Smooth Camera movement based on mouse
  targetX = mouseX * 5;
  targetY = mouseY * 2;

  camera.position.x += (targetX - camera.position.x) * 0.05;
  camera.position.y += (Math.max(2, 5 + targetY) - camera.position.y) * 0.05;
  camera.lookAt(0, 0, -10);

  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&display=swap');

.sea-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #020205;
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
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  color: white;
  pointer-events: none;
  z-index: 10;
  width: 90%;
}

h1 {
  font-family: 'Playfair Display', serif;
  font-size: 3.5rem;
  font-style: italic;
  margin-bottom: 0.5rem;
  text-shadow: 0 0 10px rgba(100, 150, 255, 0.6);
}

p {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.2rem;
  color: #aaccff;
  margin-bottom: 2rem;
}

.back-btn {
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(100, 200, 255, 0.4);
  color: #fff;
  padding: 10px 25px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(5px);
}

.back-btn:hover {
  background: rgba(100, 200, 255, 0.3);
  transform: translateY(-2px);
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
    top: 25%;
  }
}
</style>
