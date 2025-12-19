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
let mixer: THREE.AnimationMixer | null = null;
let clips: THREE.AnimationClip[] = [];
let activeAction: THREE.AnimationAction | null = null;
const pointer = { x: 0, y: 0, active: false };
let disposeFns: Array<() => void> = [];

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
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  root.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
  const fov = (camera.fov * Math.PI) / 180;
  const viewH = Math.tan(fov / 2) * 2;
  const dist = (maxDim / viewH) * 1.45;

  camera.position.set(0, maxDim * 0.15, dist);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 20;
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
  };
  updateSize();

  resizeObserver = new ResizeObserver(() => updateSize());
  resizeObserver.observe(containerRef.value);

  disposeFns.push(() => resizeObserver?.disconnect());
  disposeFns.push(() => window.removeEventListener('resize', updateSize));
  window.addEventListener('resize', updateSize);

  const updatePointer = (ev: PointerEvent) => {
    if (!containerRef.value) return;
    const rect = containerRef.value.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const nx = ((ev.clientX - rect.left) / w) * 2 - 1;
    const ny = -(((ev.clientY - rect.top) / h) * 2 - 1);
    pointer.x = THREE.MathUtils.clamp(nx, -1, 1);
    pointer.y = THREE.MathUtils.clamp(ny, -1, 1);
  };

  const onPointerMove = (ev: PointerEvent) => {
    pointer.active = true;
    updatePointer(ev);
  };
  const onPointerEnter = (ev: PointerEvent) => {
    pointer.active = true;
    updatePointer(ev);
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
      updatePresentation(clock ? clock.getElapsedTime() : 0);
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
  return partial || clips[0];
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
    targetRotY += pointer.x * 0.25;
    targetRotX += pointer.y * 0.12;
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
    const loader = new mod.GLTFLoader();

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

    presentationGroup.position.set(0, 0, 0);
    presentationGroup.rotation.set(0, 0, 0);
    presentationGroup.add(root);
    fitToView(root);

    clips = Array.isArray(gltf.animations) ? gltf.animations : [];
    if (clips.length > 0) {
      mixer = new THREE.AnimationMixer(root);
      playClip(pickClipByHint(props.motionCommand));
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
    playClip(pickClipByHint(props.motionCommand));
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
