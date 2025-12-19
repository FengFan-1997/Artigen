<template>
  <div class="vrm-widget" ref="containerRef">
    <canvas class="vrm-canvas" ref="canvasRef"></canvas>
    <div v-if="loading" class="vrm-loading">{{ loadingText }}</div>
    <div v-else-if="error" class="vrm-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';

const props = defineProps<{
  src: string;
  currentLang?: string;
  isTalking?: boolean;
  isMoving?: boolean;
  isHovered?: boolean;
  isDizzy?: boolean;
  isHappy?: boolean;
  isConfused?: boolean;
  isAngry?: boolean;
  isFainted?: boolean;
  isPouting?: boolean;
  isHeadHit?: boolean;
  isCrying?: boolean;
  isTired?: boolean;
  motionCommand?: string;
  expressionOverride?: string;
  facingLock?: boolean;
}>();

const emit = defineEmits<{
  (e: 'loading-change', loading: boolean): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

const loading = ref(false);
const error = ref('');
const loadingText = computed(() => (props.currentLang === 'zh' ? '加载中...' : 'Loading...'));

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let clock: THREE.Clock | null = null;
let frameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let presentationGroup: THREE.Group | null = null;
let mountedRoot: THREE.Object3D | null = null;
let mixer: THREE.AnimationMixer | null = null;
let clips: THREE.AnimationClip[] = [];
let activeAction: THREE.AnimationAction | null = null;
const pointer = { x: 0, y: 0, active: false };
let disposeFns: Array<() => void> = [];
let currentVrm: any | null = null;
let motionNodes: {
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  rightLowerArm: THREE.Object3D | null;
  rightHand: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  leftLowerArm: THREE.Object3D | null;
  leftHand: THREE.Object3D | null;
  rightUpperLeg: THREE.Object3D | null;
  rightLowerLeg: THREE.Object3D | null;
  leftUpperLeg: THREE.Object3D | null;
  leftLowerLeg: THREE.Object3D | null;
  base: Record<string, { x: number; y: number; z: number }>;
} = {
  hips: null,
  spine: null,
  chest: null,
  rightUpperArm: null,
  rightLowerArm: null,
  rightHand: null,
  leftUpperArm: null,
  leftLowerArm: null,
  leftHand: null,
  rightUpperLeg: null,
  rightLowerLeg: null,
  leftUpperLeg: null,
  leftLowerLeg: null,
  base: {}
};
let proceduralMotion: { name: string; startedAt: number; duration: number } | null = null;
let lastMotionCommandAt = 0;
let idleState: { nextAt: number; lastName: string | null } = { nextAt: 0, lastName: null };
let facingRootRotationY: number | null = null;
let lookNodes: {
  head: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  leftEye: THREE.Object3D | null;
  rightEye: THREE.Object3D | null;
  base: {
    head?: { x: number; y: number; z: number };
    neck?: { x: number; y: number; z: number };
    leftEye?: { x: number; y: number; z: number };
    rightEye?: { x: number; y: number; z: number };
  };
} = {
  head: null,
  neck: null,
  leftEye: null,
  rightEye: null,
  base: {}
};

const lookState = {
  lastPointerAt: 0,
  autoTargetX: 0,
  autoTargetY: 0,
  autoUntil: 0,
  nextAutoAt: 0
};

const disposeObject = (obj: THREE.Object3D) => {
  obj.traverse((child) => {
    const mesh = child as any;
    const geometry: THREE.BufferGeometry | undefined = mesh.geometry;
    const material: THREE.Material | THREE.Material[] | undefined = mesh.material;
    if (geometry && typeof geometry.dispose === 'function') geometry.dispose();
    if (material) {
      if (Array.isArray(material)) {
        for (const m of material) {
          if (m && typeof m.dispose === 'function') m.dispose();
        }
      } else {
        if (typeof material.dispose === 'function') material.dispose();
      }
    }
  });
};

const fitToView = (root: THREE.Object3D) => {
  if (!containerRef.value || !camera) return;
  root.position.set(0, 0, 0);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  root.position.sub(center);
  const fovV = (camera.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
  const safeFovV = Math.max(0.0001, fovV);
  const safeFovH = Math.max(0.0001, fovH);
  const width = Math.max(0.0001, Math.max(size.x, size.z));
  const height = Math.max(0.0001, size.y);
  const distV = height / 2 / Math.tan(safeFovV / 2);
  const distH = width / 2 / Math.tan(safeFovH / 2);
  const dist = Math.max(distV, distH) * 1.12 + size.z * 0.5;

  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 50;
  camera.updateProjectionMatrix();
};

const ensureThree = () => {
  if (!canvasRef.value || !containerRef.value) return false;
  if (renderer && scene && camera) return true;

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    alpha: true,
    antialias: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  clock = new THREE.Clock();

  presentationGroup = new THREE.Group();
  scene.add(presentationGroup);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1.05);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(3, 6, 4);
  scene.add(dir);

  const updateSize = () => {
    if (!renderer || !camera || !containerRef.value) return;
    const w = Math.max(1, containerRef.value.clientWidth);
    const h = Math.max(1, containerRef.value.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (mountedRoot) fitToView(mountedRoot);
  };
  updateSize();

  resizeObserver = new ResizeObserver(() => updateSize());
  resizeObserver.observe(containerRef.value);

  disposeFns.push(() => resizeObserver?.disconnect());
  disposeFns.push(() => window.removeEventListener('resize', updateSize));
  window.addEventListener('resize', updateSize);

  const updatePointerFromClient = (clientX: number, clientY: number) => {
    if (!containerRef.value) return;
    const rect = containerRef.value.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const nx = ((clientX - rect.left) / w) * 2 - 1;
    const ny = -(((clientY - rect.top) / h) * 2 - 1);
    pointer.x = THREE.MathUtils.clamp(nx, -1, 1);
    pointer.y = THREE.MathUtils.clamp(ny, -1, 1);
    const near = Math.abs(nx) <= 1.15 && Math.abs(ny) <= 1.15;
    pointer.active = near;
    if (near) lookState.lastPointerAt = Date.now();
  };

  const onPointerMove = (ev: PointerEvent) => {
    updatePointerFromClient(ev.clientX, ev.clientY);
  };
  const onPointerEnter = (ev: PointerEvent) => {
    updatePointerFromClient(ev.clientX, ev.clientY);
  };
  const onPointerLeave = () => {
    pointer.active = false;
  };

  containerRef.value.addEventListener('pointermove', onPointerMove);
  containerRef.value.addEventListener('pointerenter', onPointerEnter);
  containerRef.value.addEventListener('pointerleave', onPointerLeave);
  disposeFns.push(() => containerRef.value?.removeEventListener('pointermove', onPointerMove));
  disposeFns.push(() => containerRef.value?.removeEventListener('pointerenter', onPointerEnter));
  disposeFns.push(() => containerRef.value?.removeEventListener('pointerleave', onPointerLeave));

  const onWindowPointerMove = (ev: PointerEvent) => {
    updatePointerFromClient(ev.clientX, ev.clientY);
  };
  window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
  disposeFns.push(() => window.removeEventListener('pointermove', onWindowPointerMove));

  return true;
};

const stopLoop = () => {
  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
};

const startLoop = () => {
  stopLoop();
  const tick = () => {
    if (renderer && scene && camera) {
      const delta = clock ? clock.getDelta() : 0.016;
      if (mixer) mixer.update(delta);
      const elapsed = clock ? clock.getElapsedTime() : 0;
      updatePresentation(elapsed);
      applyFacingLock();
      updateLook(elapsed);
      maybeStartIdleMotion();
      applyProceduralMotion();
      if (currentVrm && typeof currentVrm.update === 'function') {
        try {
          currentVrm.update(delta);
        } catch {}
      }
      renderer.render(scene, camera);
    }
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);
};

const pickClipByHint = (hint: string | undefined) => {
  if (clips.length === 0) return null;
  const raw = (hint || '').toLowerCase().trim();
  if (!raw) return clips[0];
  const exact = clips.find((c) => c.name.toLowerCase() === raw);
  if (exact) return exact;
  const partial = clips.find((c) => c.name.toLowerCase().includes(raw));
  return partial || null;
};

const playClip = (clip: THREE.AnimationClip | null) => {
  if (!clip || !mixer) return;
  const next = mixer.clipAction(clip);
  next.setLoop(THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = false;
  next.enabled = true;
  if (activeAction && activeAction !== next) {
    activeAction.fadeOut(0.15);
    next.reset().fadeIn(0.15).play();
  } else {
    next.reset().play();
  }
  activeAction = next;
};

const captureMotionNodes = (vrm: any) => {
  motionNodes = {
    hips: null,
    spine: null,
    chest: null,
    rightUpperArm: null,
    rightLowerArm: null,
    rightHand: null,
    leftUpperArm: null,
    leftLowerArm: null,
    leftHand: null,
    rightUpperLeg: null,
    rightLowerLeg: null,
    leftUpperLeg: null,
    leftLowerLeg: null,
    base: {}
  };
  const humanoid = vrm?.humanoid;
  const getBone =
    typeof humanoid?.getNormalizedBoneNode === 'function'
      ? (name: string) => humanoid.getNormalizedBoneNode(name)
      : typeof humanoid?.getBoneNode === 'function'
        ? (name: string) => humanoid.getBoneNode(name)
        : () => null;

  const nodes: Array<[keyof typeof motionNodes, string]> = [
    ['hips', 'hips'],
    ['spine', 'spine'],
    ['chest', 'chest'],
    ['rightUpperArm', 'rightUpperArm'],
    ['rightLowerArm', 'rightLowerArm'],
    ['rightHand', 'rightHand'],
    ['leftUpperArm', 'leftUpperArm'],
    ['leftLowerArm', 'leftLowerArm'],
    ['leftHand', 'leftHand'],
    ['rightUpperLeg', 'rightUpperLeg'],
    ['rightLowerLeg', 'rightLowerLeg'],
    ['leftUpperLeg', 'leftUpperLeg'],
    ['leftLowerLeg', 'leftLowerLeg']
  ];
  for (const [key, boneName] of nodes) {
    const node = getBone(boneName) as THREE.Object3D | null;
    (motionNodes as any)[key] = node;
    if (node) {
      motionNodes.base[String(key)] = {
        x: node.rotation.x,
        y: node.rotation.y,
        z: node.rotation.z
      };
    }
  }
};

const clearProceduralMotion = () => {
  proceduralMotion = null;
  const restore = (key: keyof typeof motionNodes) => {
    const node = motionNodes[key] as THREE.Object3D | null;
    const base = motionNodes.base[String(key)];
    if (!node || !base) return;
    node.rotation.set(base.x, base.y, base.z);
  };
  restore('hips');
  restore('spine');
  restore('chest');
  restore('rightUpperArm');
  restore('rightLowerArm');
  restore('rightHand');
  restore('leftUpperArm');
  restore('leftLowerArm');
  restore('leftHand');
  restore('rightUpperLeg');
  restore('rightLowerLeg');
  restore('leftUpperLeg');
  restore('leftLowerLeg');
};

const startProceduralMotion = (name: string) => {
  const n = name.toLowerCase().trim();
  if (!n) return;
  const duration =
    n === 'wave'
      ? 1400
      : n === 'nod'
        ? 1100
        : n === 'shake_head'
          ? 1100
          : n === 'stretch'
            ? 1400
            : n === 'clap'
              ? 1400
              : n === 'yawn' || n === 'idle_yawn'
                ? 5200
                : n === 'idle_squat_think'
                  ? 7800
                  : n === 'play_hair'
                    ? 4200
                    : n === 'idle_shift_weight'
                      ? 4600
                      : 1200;
  proceduralMotion = { name: n, startedAt: Date.now(), duration };
  if (activeAction) {
    try {
      activeAction.fadeOut(0.1);
    } catch {}
  }
};

const shouldIdle = () => {
  if (!mountedRoot) return false;
  if (proceduralMotion) return false;
  const busy =
    !!props.isTalking ||
    !!props.isMoving ||
    !!props.isHovered ||
    pointer.active ||
    !!props.isDizzy ||
    !!props.isHappy ||
    !!props.isAngry ||
    !!props.isConfused ||
    !!props.isPouting ||
    !!props.isHeadHit ||
    !!props.isCrying ||
    !!props.isTired ||
    !!props.isFainted;
  if (busy) return false;
  if (activeAction && activeAction.isRunning()) return false;
  if (Date.now() - lastMotionCommandAt < 1400) return false;
  return true;
};

const scheduleNextIdle = (minMs = 6500, maxMs = 14500) => {
  const span = Math.max(0, maxMs - minMs);
  idleState.nextAt = Date.now() + minMs + Math.floor(Math.random() * (span + 1));
};

const maybeStartIdleMotion = () => {
  if (!shouldIdle()) {
    if (proceduralMotion && pointer.active) clearProceduralMotion();
    return;
  }
  if (!idleState.nextAt) scheduleNextIdle();
  if (Date.now() < idleState.nextAt) return;

  const pool = ['idle_shift_weight', 'idle_yawn', 'idle_squat_think', 'play_hair', 'stretch'];
  const candidates = pool.filter((n) => n !== idleState.lastName);
  const name =
    (candidates.length ? candidates : pool)[Math.floor(Math.random() * pool.length)] || 'idle_yawn';
  idleState.lastName = name;
  startProceduralMotion(name);
  scheduleNextIdle();
};

const applyProceduralMotion = () => {
  if (!proceduralMotion) return;
  const now = Date.now();
  const elapsedMs = now - proceduralMotion.startedAt;
  const p = proceduralMotion.duration > 0 ? elapsedMs / proceduralMotion.duration : 1;
  if (p >= 1) {
    clearProceduralMotion();
    return;
  }
  const k = Math.sin(Math.PI * p);
  const w = Math.sin(Math.PI * 6 * p) * k;

  const rUpper = motionNodes.rightUpperArm;
  const rLower = motionNodes.rightLowerArm;
  const rHand = motionNodes.rightHand;
  const lUpper = motionNodes.leftUpperArm;
  const lLower = motionNodes.leftLowerArm;
  const lHand = motionNodes.leftHand;

  const baseRU = motionNodes.base['rightUpperArm'];
  const baseRL = motionNodes.base['rightLowerArm'];
  const baseRH = motionNodes.base['rightHand'];
  const baseLU = motionNodes.base['leftUpperArm'];
  const baseLL = motionNodes.base['leftLowerArm'];
  const baseLH = motionNodes.base['leftHand'];
  const hips = motionNodes.hips;
  const spine = motionNodes.spine;
  const chest = motionNodes.chest;
  const rUpperLeg = motionNodes.rightUpperLeg;
  const rLowerLeg = motionNodes.rightLowerLeg;
  const lUpperLeg = motionNodes.leftUpperLeg;
  const lLowerLeg = motionNodes.leftLowerLeg;
  const baseHips = motionNodes.base['hips'];
  const baseSpine = motionNodes.base['spine'];
  const baseChest = motionNodes.base['chest'];
  const baseRULeg = motionNodes.base['rightUpperLeg'];
  const baseRLLeg = motionNodes.base['rightLowerLeg'];
  const baseLULeg = motionNodes.base['leftUpperLeg'];
  const baseLLLeg = motionNodes.base['leftLowerLeg'];

  const name = proceduralMotion.name;
  if (name === 'wave') {
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.55 * k;
      rUpper.rotation.z = baseRU.z - 0.25 * k;
    }
    if (rLower && baseRL) {
      rLower.rotation.z = baseRL.z - 0.18 * k;
    }
    if (rHand && baseRH) {
      rHand.rotation.y = baseRH.y + 0.65 * w;
    }
  } else if (name === 'stretch') {
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.35 * k;
      lUpper.rotation.z = baseLU.z + 0.35 * k;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.35 * k;
      rUpper.rotation.z = baseRU.z - 0.35 * k;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z + 0.12 * k;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z - 0.12 * k;
    if (lHand && baseLH) lHand.rotation.x = baseLH.x + 0.08 * k;
    if (rHand && baseRH) rHand.rotation.x = baseRH.x + 0.08 * k;
  } else if (name === 'nod') {
    const headBase = lookNodes.base.head;
    const neckBase = lookNodes.base.neck;
    if (lookNodes.head && headBase) {
      lookNodes.head.rotation.x = headBase.x + Math.sin(Math.PI * 6 * p) * 0.22 * k;
    }
    if (lookNodes.neck && neckBase) {
      lookNodes.neck.rotation.x = neckBase.x + Math.sin(Math.PI * 6 * p) * 0.12 * k;
    }
  } else if (name === 'shake_head') {
    const headBase = lookNodes.base.head;
    const neckBase = lookNodes.base.neck;
    if (lookNodes.head && headBase) {
      lookNodes.head.rotation.y = headBase.y + Math.sin(Math.PI * 6 * p) * 0.32 * k;
    }
    if (lookNodes.neck && neckBase) {
      lookNodes.neck.rotation.y = neckBase.y + Math.sin(Math.PI * 6 * p) * 0.18 * k;
    }
  } else if (name === 'clap') {
    const beat = Math.abs(Math.sin(Math.PI * 2.1 * p));
    const lift = Math.sin(Math.PI * p);
    const close = beat * lift;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.45 * lift;
      lUpper.rotation.z = baseLU.z - 0.72 * close;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.45 * lift;
      rUpper.rotation.z = baseRU.z + 0.72 * close;
    }
    if (lLower && baseLL) {
      lLower.rotation.z = baseLL.z - 0.38 * close;
    }
    if (rLower && baseRL) {
      rLower.rotation.z = baseRL.z + 0.38 * close;
    }
    if (lHand && baseLH) lHand.rotation.y = baseLH.y + 0.16 * w;
    if (rHand && baseRH) rHand.rotation.y = baseRH.y - 0.16 * w;
  } else if (name === 'yawn' || name === 'idle_yawn') {
    const ease = Math.sin(Math.PI * p);
    const slow = Math.sin(Math.PI * 2 * p) * ease;
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.55 * ease;
      rUpper.rotation.z = baseRU.z - 0.42 * ease;
    }
    if (rLower && baseRL) rLower.rotation.z = baseRL.z + 0.35 * ease;
    if (rHand && baseRH) rHand.rotation.x = baseRH.x + 0.45 * ease;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.12 * ease;
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.06 * slow;
    }
    if (spine && baseSpine) spine.rotation.x = baseSpine.x - 0.05 * ease;
    if (chest && baseChest) chest.rotation.x = baseChest.x - 0.03 * ease;
  } else if (name === 'play_hair') {
    const ease = Math.sin(Math.PI * p);
    const sway = Math.sin(Math.PI * 2.2 * p) * ease;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.52 * ease;
      lUpper.rotation.z = baseLU.z - 0.35 * ease;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z - 0.25 * ease;
    if (lHand && baseLH) {
      lHand.rotation.x = baseLH.x + 0.22 * ease;
      lHand.rotation.y = baseLH.y + 0.24 * sway;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.1 * sway;
      lookNodes.head.rotation.z = lookNodes.base.head.z - 0.08 * ease;
    }
  } else if (name === 'idle_shift_weight') {
    if (hips && baseHips) {
      hips.rotation.y = baseHips.y + Math.sin(Math.PI * 2 * p) * 0.08 * k;
      hips.rotation.z = baseHips.z + Math.sin(Math.PI * 1.6 * p) * 0.06 * k;
    }
    if (spine && baseSpine) spine.rotation.z = baseSpine.z - Math.sin(Math.PI * 1.6 * p) * 0.04 * k;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + Math.sin(Math.PI * 1.6 * p) * 0.08 * k;
    }
  } else if (name === 'idle_squat_think') {
    const ease = Math.sin(Math.PI * p);
    const hold =
      THREE.MathUtils.clamp((p - 0.18) / 0.25, 0, 1) *
      THREE.MathUtils.clamp((0.92 - p) / 0.25, 0, 1);
    const squat = ease * (0.65 + 0.35 * hold);
    if (hips && baseHips) hips.rotation.x = baseHips.x + 0.34 * squat;
    if (spine && baseSpine) spine.rotation.x = baseSpine.x - 0.12 * squat;
    if (chest && baseChest) chest.rotation.x = baseChest.x - 0.06 * squat;
    if (lUpperLeg && baseLULeg) lUpperLeg.rotation.x = baseLULeg.x - 0.68 * squat;
    if (rUpperLeg && baseRULeg) rUpperLeg.rotation.x = baseRULeg.x - 0.68 * squat;
    if (lLowerLeg && baseLLLeg) lLowerLeg.rotation.x = baseLLLeg.x + 1.12 * squat;
    if (rLowerLeg && baseRLLeg) rLowerLeg.rotation.x = baseRLLeg.x + 1.12 * squat;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.45 * squat;
      lUpper.rotation.z = baseLU.z - 0.42 * squat;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.45 * squat;
      rUpper.rotation.z = baseRU.z + 0.42 * squat;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z - 0.55 * squat;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z + 0.55 * squat;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.08 * squat;
      lookNodes.head.rotation.z = lookNodes.base.head.z + 0.12 * squat;
    }
  }
};

const handleMotionCommand = (cmd: string | undefined) => {
  const raw = (cmd || '').toLowerCase().trim();
  if (!raw) return;
  lastMotionCommandAt = Date.now();
  idleState.nextAt = 0;
  if (raw === 'idle') {
    startProceduralMotion('idle_shift_weight');
    return;
  }
  if (raw === 'yawn') {
    startProceduralMotion('yawn');
    return;
  }
  if (raw === 'clap' || raw === 'play_hair' || raw.startsWith('idle_')) {
    startProceduralMotion(raw);
    return;
  }
  const clip = pickClipByHint(raw);
  if (clip) {
    playClip(clip);
    return;
  }
  startProceduralMotion(raw);
};

const updatePresentation = (t: number) => {
  if (!presentationGroup) return;

  const hovered = !!props.isHovered || pointer.active;
  const talking = !!props.isTalking;
  const moving = !!props.isMoving;
  const dizzy = !!props.isDizzy;
  const happy = !!props.isHappy;
  const angry = !!props.isAngry;
  const confused = !!props.isConfused;
  const fainted = !!props.isFainted;
  const pouting = !!props.isPouting;
  const headHit = !!props.isHeadHit;
  const crying = !!props.isCrying;
  const tired = !!props.isTired;

  const bobSpeed = talking ? 8 : moving ? 4.5 : 2.2;
  const bobAmp = talking ? 0.018 : moving ? 0.012 : 0.006;

  let targetRotX = 0;
  let targetRotY = 0;
  let targetRotZ = 0;
  let targetPosX = 0;
  let targetPosY = fainted ? -0.18 : bobAmp * Math.sin(t * bobSpeed);

  if (hovered) {
    targetRotZ += pointer.x * 0.06;
    targetRotX += pointer.y * 0.06;
    targetPosX += pointer.x * 0.02;
  }

  if (dizzy) {
    targetRotZ += Math.sin(t * 8.5) * 0.45;
    targetRotY += t * 1.2;
    targetPosY += Math.sin(t * 6.5) * 0.01;
  }

  if (happy) {
    targetPosY += Math.abs(Math.sin(t * 6.2)) * 0.02;
    targetRotY += Math.sin(t * 3.4) * 0.08;
  }

  if (angry) {
    targetPosX += Math.sin(t * 45) * 0.01;
    targetRotY += Math.sin(t * 22) * 0.12;
  }

  if (confused) {
    targetRotY += Math.sin(t * 2.2) * 0.22;
    targetRotZ += Math.sin(t * 1.6) * 0.06;
  }

  if (pouting) {
    targetRotX += 0.08;
    targetRotY += Math.sin(t * 1.8) * 0.08;
  }

  if (headHit) {
    targetRotX -= 0.18;
    targetPosY -= 0.015;
  }

  if (crying) {
    targetRotX += 0.16;
    targetRotY += Math.sin(t * 2.1) * 0.06;
  }

  if (tired) {
    targetRotX += 0.12;
    targetPosY -= 0.01;
    targetRotZ += Math.sin(t * 1.1) * 0.04;
  }

  if (fainted) {
    targetRotZ = -1.25;
    targetRotX = 0.08;
    targetRotY = 0;
    targetPosX = 0;
  }

  const k = 0.12;
  presentationGroup.rotation.x = THREE.MathUtils.lerp(presentationGroup.rotation.x, targetRotX, k);
  presentationGroup.rotation.y = THREE.MathUtils.lerp(presentationGroup.rotation.y, targetRotY, k);
  presentationGroup.rotation.z = THREE.MathUtils.lerp(presentationGroup.rotation.z, targetRotZ, k);
  presentationGroup.position.x = THREE.MathUtils.lerp(presentationGroup.position.x, targetPosX, k);
  presentationGroup.position.y = THREE.MathUtils.lerp(presentationGroup.position.y, targetPosY, k);
};

const captureLookNodes = (vrm: any) => {
  lookNodes = { head: null, neck: null, leftEye: null, rightEye: null, base: {} };
  const humanoid = vrm?.humanoid;
  const getBone =
    typeof humanoid?.getNormalizedBoneNode === 'function'
      ? (name: string) => humanoid.getNormalizedBoneNode(name)
      : typeof humanoid?.getBoneNode === 'function'
        ? (name: string) => humanoid.getBoneNode(name)
        : () => null;

  const head = getBone('head') as THREE.Object3D | null;
  const neck = getBone('neck') as THREE.Object3D | null;
  const leftEye = getBone('leftEye') as THREE.Object3D | null;
  const rightEye = getBone('rightEye') as THREE.Object3D | null;

  lookNodes.head = head;
  lookNodes.neck = neck;
  lookNodes.leftEye = leftEye;
  lookNodes.rightEye = rightEye;

  if (head) lookNodes.base.head = { x: head.rotation.x, y: head.rotation.y, z: head.rotation.z };
  if (neck) lookNodes.base.neck = { x: neck.rotation.x, y: neck.rotation.y, z: neck.rotation.z };
  if (leftEye)
    lookNodes.base.leftEye = {
      x: leftEye.rotation.x,
      y: leftEye.rotation.y,
      z: leftEye.rotation.z
    };
  if (rightEye)
    lookNodes.base.rightEye = {
      x: rightEye.rotation.x,
      y: rightEye.rotation.y,
      z: rightEye.rotation.z
    };
};

const applyRelaxPose = (vrm: any) => {
  const humanoid = vrm?.humanoid;
  const getBone =
    typeof humanoid?.getNormalizedBoneNode === 'function'
      ? (name: string) => humanoid.getNormalizedBoneNode(name)
      : typeof humanoid?.getBoneNode === 'function'
        ? (name: string) => humanoid.getBoneNode(name)
        : () => null;

  try {
    if (typeof humanoid?.resetNormalizedPose === 'function') humanoid.resetNormalizedPose();
  } catch {}

  const lUpperArm = getBone('leftUpperArm') as THREE.Object3D | null;
  const rUpperArm = getBone('rightUpperArm') as THREE.Object3D | null;
  const lLowerArm = getBone('leftLowerArm') as THREE.Object3D | null;
  const rLowerArm = getBone('rightLowerArm') as THREE.Object3D | null;
  const lHand = getBone('leftHand') as THREE.Object3D | null;
  const rHand = getBone('rightHand') as THREE.Object3D | null;
  const spine = getBone('spine') as THREE.Object3D | null;
  const hips = getBone('hips') as THREE.Object3D | null;

  if (spine) spine.rotation.x = -0.03;
  if (hips) hips.rotation.x = 0.02;

  if (lUpperArm) {
    lUpperArm.rotation.z = 0.55;
    lUpperArm.rotation.x = -0.08;
    lUpperArm.rotation.y = 0.05;
  }
  if (rUpperArm) {
    rUpperArm.rotation.z = -0.55;
    rUpperArm.rotation.x = -0.08;
    rUpperArm.rotation.y = -0.05;
  }
  if (lLowerArm) lLowerArm.rotation.z = 0.06;
  if (rLowerArm) rLowerArm.rotation.z = -0.06;
  if (lHand) lHand.rotation.z = 0.02;
  if (rHand) rHand.rotation.z = -0.02;
};

const ensureFacingCamera = (vrm: any, root: THREE.Object3D) => {
  const humanoid = vrm?.humanoid;
  const getBone =
    typeof humanoid?.getNormalizedBoneNode === 'function'
      ? (name: string) => humanoid.getNormalizedBoneNode(name)
      : typeof humanoid?.getBoneNode === 'function'
        ? (name: string) => humanoid.getBoneNode(name)
        : () => null;

  const left = (getBone('leftUpperArm') || getBone('leftShoulder')) as THREE.Object3D | null;
  const right = (getBone('rightUpperArm') || getBone('rightShoulder')) as THREE.Object3D | null;
  const hips = getBone('hips') as THREE.Object3D | null;
  const head = (getBone('head') || getBone('neck')) as THREE.Object3D | null;
  if (!left || !right || !hips || !head) return;

  root.updateMatrixWorld(true);
  const vLeft = new THREE.Vector3();
  const vRight = new THREE.Vector3();
  const vHips = new THREE.Vector3();
  const vHead = new THREE.Vector3();
  left.getWorldPosition(vLeft);
  right.getWorldPosition(vRight);
  hips.getWorldPosition(vHips);
  head.getWorldPosition(vHead);

  const up = vHead.clone().sub(vHips);
  const across = vRight.clone().sub(vLeft);
  if (up.lengthSq() < 1e-6 || across.lengthSq() < 1e-6) return;
  up.normalize();
  across.normalize();
  const forwardRaw = across.clone().cross(up).normalize();
  const desiredRaw = (() => {
    if (!camera) return new THREE.Vector3(0, 0, 1);
    const rootPos = new THREE.Vector3();
    root.getWorldPosition(rootPos);
    const dir = camera.position.clone().sub(rootPos);
    if (dir.lengthSq() < 1e-6) return new THREE.Vector3(0, 0, 1);
    return dir.normalize();
  })();

  const forward = forwardRaw.clone();
  forward.y = 0;
  const desired = desiredRaw.clone();
  desired.y = 0;
  if (forward.lengthSq() < 1e-6 || desired.lengthSq() < 1e-6) return;
  forward.normalize();
  desired.normalize();

  const forwardOpp = forward.clone().multiplyScalar(-1);
  const chosenForward = forward.dot(desired) >= forwardOpp.dot(desired) ? forward : forwardOpp;

  const normalizeAngle = (a: number) => {
    let x = a;
    while (x > Math.PI) x -= Math.PI * 2;
    while (x < -Math.PI) x += Math.PI * 2;
    return x;
  };

  const yawFromVec = (v: THREE.Vector3) => Math.atan2(v.x, v.z);
  const currentYaw = yawFromVec(chosenForward);
  const desiredYaw = yawFromVec(desired);
  const deltaYaw = normalizeAngle(desiredYaw - currentYaw);

  root.rotation.y = normalizeAngle(root.rotation.y + deltaYaw);
  root.updateMatrixWorld(true);

  const parentYaw = (root.parent as any)?.rotation?.y ?? 0;
  facingRootRotationY = normalizeAngle(root.rotation.y + parentYaw);
};

const applyFacingLock = () => {
  if (props.facingLock === false) return;
  if (!mountedRoot) return;
  if (facingRootRotationY == null) return;
  const parentYaw = (mountedRoot.parent as any)?.rotation?.y ?? 0;
  const targetLocalYaw =
    THREE.MathUtils.euclideanModulo(facingRootRotationY - parentYaw + Math.PI, Math.PI * 2) -
    Math.PI;
  mountedRoot.rotation.y = THREE.MathUtils.lerp(mountedRoot.rotation.y, targetLocalYaw, 0.35);
};

const updateLook = (t: number) => {
  const head = lookNodes.head || lookNodes.neck;
  if (!head) return;

  const now = Date.now();
  const pointerRecent = now - lookState.lastPointerAt < 900;
  if (!pointerRecent && now >= lookState.nextAutoAt && now >= lookState.autoUntil) {
    lookState.autoTargetX = (Math.random() * 2 - 1) * 0.65;
    lookState.autoTargetY = (Math.random() * 2 - 1) * 0.35;
    lookState.autoUntil = now + 1100 + Math.floor(Math.random() * 800);
    lookState.nextAutoAt = now + 4200 + Math.floor(Math.random() * 3800);
  }

  const usePointer = pointerRecent && pointer.active;
  const tx = usePointer ? pointer.x : now < lookState.autoUntil ? lookState.autoTargetX : 0;
  const ty = usePointer ? pointer.y : now < lookState.autoUntil ? lookState.autoTargetY : 0;

  const headYaw = THREE.MathUtils.clamp(tx * 0.38, -0.42, 0.42);
  const headPitch = THREE.MathUtils.clamp(ty * 0.16 + Math.sin(t * 0.7) * 0.015, -0.2, 0.2);

  const neckYaw = headYaw * 0.55;
  const neckPitch = headPitch * 0.55;

  const eyeYaw = THREE.MathUtils.clamp(tx * 0.22, -0.28, 0.28);
  const eyePitch = THREE.MathUtils.clamp(ty * 0.12, -0.18, 0.18);

  const k = 0.09;
  const headBase = lookNodes.base.head || { x: 0, y: 0, z: 0 };
  const neckBase = lookNodes.base.neck || { x: 0, y: 0, z: 0 };
  const leftEyeBase = lookNodes.base.leftEye || { x: 0, y: 0, z: 0 };
  const rightEyeBase = lookNodes.base.rightEye || { x: 0, y: 0, z: 0 };

  if (lookNodes.head) {
    lookNodes.head.rotation.y = THREE.MathUtils.lerp(
      lookNodes.head.rotation.y,
      headBase.y + headYaw,
      k
    );
    lookNodes.head.rotation.x = THREE.MathUtils.lerp(
      lookNodes.head.rotation.x,
      headBase.x + headPitch,
      k
    );
  }

  if (lookNodes.neck) {
    lookNodes.neck.rotation.y = THREE.MathUtils.lerp(
      lookNodes.neck.rotation.y,
      neckBase.y + neckYaw,
      k
    );
    lookNodes.neck.rotation.x = THREE.MathUtils.lerp(
      lookNodes.neck.rotation.x,
      neckBase.x + neckPitch,
      k
    );
  }

  if (lookNodes.leftEye) {
    lookNodes.leftEye.rotation.y = THREE.MathUtils.lerp(
      lookNodes.leftEye.rotation.y,
      leftEyeBase.y + eyeYaw,
      k * 1.35
    );
    lookNodes.leftEye.rotation.x = THREE.MathUtils.lerp(
      lookNodes.leftEye.rotation.x,
      leftEyeBase.x + eyePitch,
      k * 1.35
    );
  }

  if (lookNodes.rightEye) {
    lookNodes.rightEye.rotation.y = THREE.MathUtils.lerp(
      lookNodes.rightEye.rotation.y,
      rightEyeBase.y + eyeYaw,
      k * 1.35
    );
    lookNodes.rightEye.rotation.x = THREE.MathUtils.lerp(
      lookNodes.rightEye.rotation.x,
      rightEyeBase.x + eyePitch,
      k * 1.35
    );
  }
};

const loadModel = async (url: string) => {
  if (!ensureThree() || !scene || !presentationGroup) return;
  if (!url) return;

  loading.value = true;
  error.value = '';

  if (mixer) {
    try {
      mixer.stopAllAction();
    } catch {}
  }
  mixer = null;
  clips = [];
  activeAction = null;
  currentVrm = null;
  mountedRoot = null;
  proceduralMotion = null;
  lookNodes = { head: null, neck: null, leftEye: null, rightEye: null, base: {} };
  idleState = { nextAt: 0, lastName: null };
  facingRootRotationY = null;

  for (const child of presentationGroup.children.slice()) {
    try {
      presentationGroup.remove(child);
    } catch {}
    try {
      disposeObject(child);
    } catch {}
  }

  try {
    const mod = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const vrmMod = await import('@pixiv/three-vrm');
    const loader = new mod.GLTFLoader();
    if (typeof vrmMod?.VRMLoaderPlugin === 'function') {
      loader.register((parser: any) => new vrmMod.VRMLoaderPlugin(parser));
    }

    const gltf = await new Promise<any>((resolve, reject) => {
      loader.load(
        url,
        (res) => resolve(res),
        undefined,
        (err) => reject(err)
      );
    });

    const root = gltf.scene || gltf.scenes?.[0];
    if (!root) {
      throw new Error(props.currentLang === 'zh' ? '模型加载失败' : 'Failed to load model');
    }

    const vrm = gltf?.userData?.vrm;
    if (vrm) {
      currentVrm = vrm;
      try {
        if (vrmMod?.VRMUtils && typeof vrmMod.VRMUtils.rotateVRM0 === 'function') {
          vrmMod.VRMUtils.rotateVRM0(vrm);
        }
      } catch {}
      try {
        applyRelaxPose(vrm);
      } catch {}
      try {
        captureLookNodes(vrm);
      } catch {}
      try {
        captureMotionNodes(vrm);
      } catch {}
    }

    presentationGroup.position.set(0, 0, 0);
    presentationGroup.rotation.set(0, 0, 0);
    const toMount = vrm?.scene || root;
    try {
      toMount.scale.multiplyScalar(1.8);
    } catch {}
    presentationGroup.add(toMount);
    mountedRoot = toMount;
    try {
      ensureFacingCamera(vrm, toMount);
    } catch {}
    fitToView(toMount);
    try {
      ensureFacingCamera(vrm, toMount);
    } catch {}

    clips = Array.isArray(gltf.animations) ? gltf.animations : [];
    if (clips.length > 0) {
      mixer = new THREE.AnimationMixer(toMount);
      handleMotionCommand(props.motionCommand);
    } else {
      handleMotionCommand(props.motionCommand);
    }

    startLoop();
  } catch (e: any) {
    const msg =
      typeof e?.message === 'string'
        ? e.message
        : props.currentLang === 'zh'
          ? '模型加载失败'
          : 'Failed to load model';
    error.value = msg;
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.src,
  (next) => {
    void loadModel(next);
  }
);

watch(loading, (v) => emit('loading-change', v), { immediate: true });

watch(
  () => props.motionCommand,
  () => {
    handleMotionCommand(props.motionCommand);
  }
);

onMounted(() => {
  void loadModel(props.src);
});

onBeforeUnmount(() => {
  stopLoop();
  for (const fn of disposeFns) {
    try {
      fn();
    } catch {}
  }
  disposeFns = [];

  if (mixer) {
    try {
      mixer.stopAllAction();
    } catch {}
  }
  mixer = null;
  clips = [];
  activeAction = null;

  if (presentationGroup) {
    for (const child of presentationGroup.children.slice()) {
      try {
        presentationGroup.remove(child);
      } catch {}
      try {
        disposeObject(child);
      } catch {}
    }
  }

  scene = null;
  camera = null;
  clock = null;
  presentationGroup = null;

  if (renderer) {
    try {
      renderer.dispose();
    } catch {}
    renderer = null;
  }
});
</script>

<style scoped>
.vrm-widget {
  position: relative;
  width: 100%;
  height: 100%;
}

.vrm-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.vrm-loading,
.vrm-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e2e8f0;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
}

.vrm-error {
  color: #fecaca;
}
</style>
