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
  personaText?: string;
  mouseControlEnabled?: boolean;
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
  leftShoulder: THREE.Object3D | null;
  rightShoulder: THREE.Object3D | null;
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
  leftShoulder: null,
  rightShoulder: null,
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
let proceduralMotion: {
  name: string;
  startedAt: number;
  duration: number;
  seed: number;
  side: 'left' | 'right';
  intensity: number;
} | null = null;
let proceduralBase: Record<string, { x: number; y: number; z: number }> = {};
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

const faceState: {
  blinkNextAt: number;
  blinkStartedAt: number;
  blinkDuration: number;
  blinkActive: boolean;
  microNextAt: number;
  microStartedAt: number;
  microDuration: number;
  microType: string;
  values: Record<string, number>;
} = {
  blinkNextAt: 0,
  blinkStartedAt: 0,
  blinkDuration: 0,
  blinkActive: false,
  microNextAt: 0,
  microStartedAt: 0,
  microDuration: 0,
  microType: '',
  values: {}
};

const lookState = {
  lastPointerAt: 0,
  autoTargetX: 0,
  autoTargetY: 0,
  autoUntil: 0,
  nextAutoAt: 0,
  leftEyeTargetX: 0,
  leftEyeTargetY: 0,
  rightEyeTargetX: 0,
  rightEyeTargetY: 0
};

const mouseControl = {
  pointerId: null as number | null,
  dragging: false,
  lastClientX: 0,
  lastClientY: 0,
  yaw: 0,
  pitch: 0,
  targetYaw: 0,
  targetPitch: 0
};

watch(
  () => !!props.mouseControlEnabled,
  (enabled) => {
    if (enabled) return;
    mouseControl.pointerId = null;
    mouseControl.dragging = false;
    mouseControl.targetYaw = 0;
    mouseControl.targetPitch = 0;
  }
);

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
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const humanoid = currentVrm?.humanoid;
  const getBone =
    typeof humanoid?.getNormalizedBoneNode === 'function'
      ? (name: string) => humanoid.getNormalizedBoneNode(name)
      : typeof humanoid?.getBoneNode === 'function'
        ? (name: string) => humanoid.getBoneNode(name)
        : (_name: string) => null;

  const headNode = (getBone('head') || getBone('neck')) as THREE.Object3D | null;
  const leftFootNode = (getBone('leftFoot') || getBone('leftToes')) as THREE.Object3D | null;
  const rightFootNode = (getBone('rightFoot') || getBone('rightToes')) as THREE.Object3D | null;
  const useHumanoidFrame = !!headNode && (!!leftFootNode || !!rightFootNode);
  if (useHumanoidFrame) {
    const headPos = new THREE.Vector3();
    const lfPos = new THREE.Vector3();
    const rfPos = new THREE.Vector3();
    headNode.getWorldPosition(headPos);
    if (leftFootNode) leftFootNode.getWorldPosition(lfPos);
    if (rightFootNode) rightFootNode.getWorldPosition(rfPos);
    const footY =
      leftFootNode && rightFootNode ? Math.min(lfPos.y, rfPos.y) : leftFootNode ? lfPos.y : rfPos.y;
    const humanoidHeight = Math.max(0.0001, headPos.y - footY);
    size.y = Math.max(size.y, humanoidHeight);
    center.y = (headPos.y + footY) / 2;
  }

  root.position.sub(center);
  const fovV = (camera.fov * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
  const safeFovV = Math.max(0.0001, fovV);
  const safeFovH = Math.max(0.0001, fovH);
  const width = Math.max(0.0001, Math.max(size.x, size.z));
  const height = Math.max(0.0001, size.y);
  const distV = height / 2 / Math.tan(safeFovV / 2);
  const distH = width / 2 / Math.tan(safeFovH / 2);
  const margin = useHumanoidFrame ? 1.32 : 1.22;
  const dist = Math.max(distV, distH) * margin + size.z * 0.55;

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
    if (!props.mouseControlEnabled) return;
    if (!mouseControl.dragging) return;
    if (mouseControl.pointerId != null && ev.pointerId !== mouseControl.pointerId) return;
    const dx = ev.clientX - mouseControl.lastClientX;
    const dy = ev.clientY - mouseControl.lastClientY;
    mouseControl.lastClientX = ev.clientX;
    mouseControl.lastClientY = ev.clientY;
    const scale = 0.004;
    mouseControl.targetYaw = THREE.MathUtils.clamp(
      mouseControl.targetYaw + dx * scale,
      -1.35,
      1.35
    );
    mouseControl.targetPitch = THREE.MathUtils.clamp(
      mouseControl.targetPitch + dy * scale,
      -0.85,
      0.85
    );
    ev.preventDefault();
  };
  const onPointerDown = (ev: PointerEvent) => {
    if (!props.mouseControlEnabled) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    mouseControl.dragging = true;
    mouseControl.pointerId = ev.pointerId;
    mouseControl.lastClientX = ev.clientX;
    mouseControl.lastClientY = ev.clientY;
    try {
      containerRef.value?.setPointerCapture(ev.pointerId);
    } catch {}
    ev.preventDefault();
  };
  const endPointerDrag = (ev: PointerEvent) => {
    if (!mouseControl.dragging) return;
    if (mouseControl.pointerId != null && ev.pointerId !== mouseControl.pointerId) return;
    mouseControl.dragging = false;
    mouseControl.pointerId = null;
  };
  const onPointerEnter = (ev: PointerEvent) => {
    updatePointerFromClient(ev.clientX, ev.clientY);
  };
  const onPointerLeave = () => {
    pointer.active = false;
  };

  containerRef.value.addEventListener('pointermove', onPointerMove);
  containerRef.value.addEventListener('pointerdown', onPointerDown);
  containerRef.value.addEventListener('pointerup', endPointerDrag);
  containerRef.value.addEventListener('pointercancel', endPointerDrag);
  containerRef.value.addEventListener('pointerenter', onPointerEnter);
  containerRef.value.addEventListener('pointerleave', onPointerLeave);
  disposeFns.push(() => containerRef.value?.removeEventListener('pointermove', onPointerMove));
  disposeFns.push(() => containerRef.value?.removeEventListener('pointerdown', onPointerDown));
  disposeFns.push(() => containerRef.value?.removeEventListener('pointerup', endPointerDrag));
  disposeFns.push(() => containerRef.value?.removeEventListener('pointercancel', endPointerDrag));
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

const setVrmExpression = (key: string, value: number) => {
  const mgr = currentVrm?.expressionManager;
  if (!mgr || typeof mgr.setValue !== 'function') return;
  const v = THREE.MathUtils.clamp(value, 0, 1);
  const k = String(key || '').trim();
  if (!k) return;
  const keys = new Set<string>();
  keys.add(k);
  if (k.length > 1) keys.add(k[0].toUpperCase() + k.slice(1));
  if (k === 'blink') keys.add('Blink');
  if (k === 'blinkLeft') keys.add('BlinkLeft');
  if (k === 'blinkRight') keys.add('BlinkRight');
  if (k === 'aa') keys.add('A');
  if (k === 'ih') keys.add('I');
  if (k === 'ou') keys.add('U');
  if (k === 'ee') keys.add('E');
  if (k === 'oh') keys.add('O');
  try {
    for (const kk of keys) {
      try {
        mgr.setValue(kk, v);
      } catch {}
    }
  } catch {}
};

const updateExpressions = (t: number, delta: number) => {
  const now = Date.now();
  if (!faceState.blinkNextAt) {
    faceState.blinkNextAt = now + 1200 + Math.floor(Math.random() * 2200);
  }

  const fainted = !!props.isFainted;
  const tired = !!props.isTired;
  const hovered = !!props.isHovered || pointer.active;

  if (!faceState.blinkActive && !fainted && now >= faceState.blinkNextAt) {
    faceState.blinkActive = true;
    faceState.blinkStartedAt = now;
    faceState.blinkDuration = 260 + Math.floor(Math.random() * 90);
    faceState.blinkNextAt =
      now +
      (tired ? 1200 : 2200) +
      Math.floor(Math.random() * (tired ? 2200 : 4200)) +
      (hovered ? 200 : 0);
  }

  let blinkTarget = 0;
  if (fainted) {
    blinkTarget = 1;
  } else if (faceState.blinkActive) {
    const p =
      faceState.blinkDuration > 0 ? (now - faceState.blinkStartedAt) / faceState.blinkDuration : 1;
    if (p >= 1) {
      faceState.blinkActive = false;
      blinkTarget = 0;
    } else {
      const close = THREE.MathUtils.clamp(p / 0.45, 0, 1);
      const open = THREE.MathUtils.clamp((1 - p) / 0.55, 0, 1);
      blinkTarget = close * open;
      blinkTarget = Math.min(1, blinkTarget * 1.35);
    }
  }

  const crying = !!props.isCrying && !fainted;
  if (tired && !fainted) blinkTarget = THREE.MathUtils.clamp(Math.max(blinkTarget, 0.18), 0, 1);
  if (crying && !fainted) blinkTarget = THREE.MathUtils.clamp(Math.max(blinkTarget, 0.14), 0, 1);

  const talk = !!props.isTalking && !fainted;
  const idleMouth =
    crying || tired
      ? THREE.MathUtils.clamp(
          (crying ? 0.06 : 0.03) + (crying ? 0.02 : 0.01) * Math.sin(t * (crying ? 2.4 : 1.8)),
          0,
          0.12
        )
      : 0;
  const mouthOpen = talk
    ? THREE.MathUtils.clamp(0.16 + 0.2 * Math.sin(t * 11.5) + 0.1 * Math.sin(t * 19.2), 0, 1)
    : idleMouth;
  const mouthWide = talk ? 0.5 + 0.5 * Math.sin(t * 7.4 + 0.7) : crying ? 0.25 : 0;
  const mouthRound = talk
    ? 0.5 + 0.5 * Math.sin(t * 5.2 + 1.8)
    : props.isPouting || crying
      ? 0.65
      : 0;
  const aaTarget = THREE.MathUtils.clamp(mouthOpen * (0.78 + 0.18 * mouthWide), 0, 1);
  const ihTarget = THREE.MathUtils.clamp(
    mouthOpen * (0.26 + 0.22 * mouthWide) * (0.95 - 0.35 * mouthRound),
    0,
    1
  );
  const eeTarget = THREE.MathUtils.clamp(
    mouthOpen * (0.18 + 0.18 * mouthWide) * (0.85 - 0.25 * mouthRound),
    0,
    1
  );
  const ouTarget = THREE.MathUtils.clamp(
    mouthOpen * (0.26 + 0.22 * mouthRound) * (0.9 - 0.25 * mouthWide),
    0,
    1
  );
  const ohTarget = THREE.MathUtils.clamp(mouthOpen * (0.22 + 0.26 * mouthRound), 0, 1);

  const expKey = String(props.expressionOverride || '')
    .toLowerCase()
    .trim();
  const happyTarget = expKey === 'happy' || !!props.isHappy ? 0.8 : expKey === 'neutral' ? 0 : 0;
  const angryTarget = expKey === 'angry' || !!props.isAngry ? 0.85 : expKey === 'neutral' ? 0 : 0;
  const sadTarget =
    expKey === 'sad' || !!props.isCrying || !!props.isPouting ? 0.65 : expKey === 'neutral' ? 0 : 0;
  const surprisedTarget = expKey === 'surprised' ? 0.85 : 0;
  const relaxedTarget = tired ? 0.35 : 0;

  const allowMicro =
    !talk &&
    !fainted &&
    !props.isAngry &&
    !props.isCrying &&
    !props.isPouting &&
    expKey !== 'angry' &&
    expKey !== 'sad';
  if (allowMicro && now >= faceState.microNextAt) {
    faceState.microType = Math.random() < 0.7 ? 'happy' : 'relaxed';
    faceState.microStartedAt = now;
    faceState.microDuration = 900 + Math.floor(Math.random() * 900);
    faceState.microNextAt = now + 5200 + Math.floor(Math.random() * 7800);
  }

  let microHappy = 0;
  let microRelaxed = 0;
  if (allowMicro && faceState.microStartedAt && faceState.microDuration > 0) {
    const mp = (now - faceState.microStartedAt) / faceState.microDuration;
    if (mp >= 1) {
      faceState.microStartedAt = 0;
      faceState.microDuration = 0;
      faceState.microType = '';
    } else {
      const up = THREE.MathUtils.clamp(mp / 0.35, 0, 1);
      const down = THREE.MathUtils.clamp((1 - mp) / 0.45, 0, 1);
      const env = up * down;
      if (faceState.microType === 'happy') microHappy = 0.28 * env;
      else if (faceState.microType === 'relaxed') microRelaxed = 0.22 * env;
    }
  }

  const s = 1 - Math.exp(-Math.max(0, delta) * 10);
  const step = (key: string, target: number) => {
    const cur = typeof faceState.values[key] === 'number' ? faceState.values[key] : 0;
    const next = cur + (target - cur) * s;
    faceState.values[key] = next;
    setVrmExpression(key, next);
  };

  if (currentVrm?.expressionManager) {
    step('blink', blinkTarget);
    step('blinkLeft', blinkTarget);
    step('blinkRight', blinkTarget);
    step('aa', aaTarget);
    step('ih', ihTarget);
    step('ee', eeTarget);
    step('ou', ouTarget);
    step('oh', Math.max(ohTarget, props.isPouting ? 0.22 : 0));

    step('happy', THREE.MathUtils.clamp(happyTarget + microHappy, 0, 1));
    step('angry', angryTarget);
    step('sad', sadTarget);
    step('surprised', surprisedTarget);
    step('relaxed', THREE.MathUtils.clamp(relaxedTarget + microRelaxed, 0, 1));
  } else {
    if (lookNodes.leftEye) {
      const targetX =
        typeof lookState.leftEyeTargetX === 'number'
          ? lookState.leftEyeTargetX
          : (lookNodes.base.leftEye?.x ?? lookNodes.leftEye.rotation.x);
      lookNodes.leftEye.rotation.x = THREE.MathUtils.lerp(
        lookNodes.leftEye.rotation.x,
        targetX + blinkTarget * 0.28,
        0.65
      );
    }
    if (lookNodes.rightEye) {
      const targetX =
        typeof lookState.rightEyeTargetX === 'number'
          ? lookState.rightEyeTargetX
          : (lookNodes.base.rightEye?.x ?? lookNodes.rightEye.rotation.x);
      lookNodes.rightEye.rotation.x = THREE.MathUtils.lerp(
        lookNodes.rightEye.rotation.x,
        targetX + blinkTarget * 0.28,
        0.65
      );
    }
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
      updateExpressions(elapsed, delta);
      maybeStartIdleMotion();
      applyProceduralMotion();
      applyBaselineMotion(elapsed, delta);
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
    leftShoulder: null,
    rightShoulder: null,
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
    ['leftShoulder', 'leftShoulder'],
    ['rightShoulder', 'rightShoulder'],
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
    const node =
      boneName === 'chest'
        ? ((getBone('chest') || getBone('upperChest')) as THREE.Object3D | null)
        : (getBone(boneName) as THREE.Object3D | null);
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
  const restoreBase = proceduralBase;
  proceduralMotion = null;
  const restore = (key: keyof typeof motionNodes) => {
    const node = motionNodes[key] as THREE.Object3D | null;
    const base = restoreBase[String(key)] || motionNodes.base[String(key)];
    if (!node || !base) return;
    node.rotation.set(base.x, base.y, base.z);
  };
  restore('hips');
  restore('spine');
  restore('chest');
  restore('leftShoulder');
  restore('rightShoulder');
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
  proceduralBase = {};
};

const snapshotProceduralBase = () => {
  const next: Record<string, { x: number; y: number; z: number }> = {};
  const snapshot = (key: keyof typeof motionNodes) => {
    const node = motionNodes[key] as THREE.Object3D | null;
    const fallback = motionNodes.base[String(key)];
    if (node) {
      next[String(key)] = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z };
      return;
    }
    if (fallback) next[String(key)] = { x: fallback.x, y: fallback.y, z: fallback.z };
  };
  snapshot('hips');
  snapshot('spine');
  snapshot('chest');
  snapshot('leftShoulder');
  snapshot('rightShoulder');
  snapshot('rightUpperArm');
  snapshot('rightLowerArm');
  snapshot('rightHand');
  snapshot('leftUpperArm');
  snapshot('leftLowerArm');
  snapshot('leftHand');
  snapshot('rightUpperLeg');
  snapshot('rightLowerLeg');
  snapshot('leftUpperLeg');
  snapshot('leftLowerLeg');
  proceduralBase = next;
};

const resolveProceduralMotionName = (input: string) => {
  const n = (input || '').toLowerCase().trim();
  if (!n) return '';
  const direct =
    n === 'wave' ||
    n === 'nod' ||
    n === 'shake_head' ||
    n === 'shake' ||
    n === 'stretch' ||
    n === 'clap' ||
    n === 'tap_body' ||
    n === 'flick_head' ||
    n === 'head_hit' ||
    n === 'crouch' ||
    n === 'tilt_left' ||
    n === 'tilt_right' ||
    n === 'happy' ||
    n === 'friend' ||
    n === 'activity' ||
    n === 'point_left' ||
    n === 'point_right' ||
    n === 'yawn' ||
    n === 'play_hair' ||
    n === 'idle' ||
    n === 'mood_happy' ||
    n === 'mood_angry' ||
    n === 'mood_tired' ||
    n === 'mood_sleepy' ||
    n === 'mood_confused' ||
    n.startsWith('idle_');
  if (direct) {
    if (n === 'idle') return 'idle_shift_weight';
    if (n === 'mood_happy') return 'happy';
    if (n === 'mood_confused') return 'idle_think';
    if (n === 'mood_tired') return 'idle_squat_think';
    if (n === 'mood_sleepy') return 'idle_yawn';
    return n;
  }

  if (/^(wave|hello|hi)\b/i.test(n) || n.includes('greet')) return 'wave';
  if (n.includes('head_hit') || n.includes('headhit') || (n.includes('hit') && n.includes('head')))
    return 'head_hit';
  if (n.includes('crouch') || n.includes('squat')) return 'crouch';
  if (n.includes('nod') || n.includes('yes') || n.includes('agree')) return 'nod';
  if (n.includes('shake_head') || (n.includes('shake') && n.includes('head')) || n.includes('no'))
    return 'shake_head';
  if (n.includes('shake') || n.includes('tremble')) return 'shake';
  if (n.includes('yawn') || n.includes('sleep')) return 'idle_yawn';
  if (n.includes('angry') || n.includes('mad')) return 'mood_angry';
  if (n.includes('happy') || n.includes('smile') || n.includes('joy')) return 'happy';
  if (n.includes('point') && n.includes('left')) return 'point_left';
  if (n.includes('point') && n.includes('right')) return 'point_right';
  if (n.includes('point')) return Math.random() < 0.5 ? 'point_left' : 'point_right';
  if (n.includes('think') || n.includes('confus') || n.includes('hmm')) return 'idle_think';
  if (n.includes('stretch')) return 'stretch';
  if (n.includes('clap')) return 'clap';
  if (n.includes('tap') || n.includes('poke')) return 'tap_body';

  return 'tap_body';
};

const startProceduralMotion = (name: string) => {
  const n = resolveProceduralMotionName(name);
  if (!n) return;
  snapshotProceduralBase();
  const duration =
    n === 'wave'
      ? 1400
      : n === 'nod'
        ? 1100
        : n === 'shake_head'
          ? 1100
          : n === 'shake'
            ? 1200
            : n === 'stretch'
              ? 1400
              : n === 'clap'
                ? 1400
                : n === 'tap_body'
                  ? 900
                  : n === 'flick_head'
                    ? 1100
                    : n === 'head_hit'
                      ? 900
                      : n === 'crouch'
                        ? 2400
                        : n === 'tilt_left' || n === 'tilt_right'
                          ? 1100
                          : n === 'happy' || n === 'friend' || n === 'mood_happy'
                            ? 1400
                            : n === 'mood_angry'
                              ? 1300
                              : n === 'mood_confused'
                                ? 1600
                                : n === 'activity'
                                  ? 1500
                                  : n === 'point_left' || n === 'point_right'
                                    ? 1300
                                    : n === 'idle_look_around'
                                      ? 3200
                                      : n === 'idle_think'
                                        ? 3400
                                        : n === 'idle_adjust_clothes'
                                          ? 2600
                                          : n === 'idle_arms_cross'
                                            ? 3600
                                            : n === 'idle_hands_on_hips'
                                              ? 3200
                                              : n === 'idle_stretch_neck'
                                                ? 3000
                                                : n === 'idle_head_tilt'
                                                  ? 2600
                                                  : n === 'idle_shrug'
                                                    ? 2200
                                                    : n === 'idle_sigh'
                                                      ? 2400
                                                      : n === 'idle_fidget_hands'
                                                        ? 3200
                                                        : n === 'idle_check_nails'
                                                          ? 3600
                                                          : n === 'idle_tap_foot'
                                                            ? 3000
                                                            : n === 'idle_rub_neck'
                                                              ? 3800
                                                              : n === 'idle_breathe_deep'
                                                                ? 3600
                                                                : n === 'idle_lean'
                                                                  ? 3400
                                                                  : n === 'idle_touch_face'
                                                                    ? 3600
                                                                    : n === 'idle_adjust_hair'
                                                                      ? 4200
                                                                      : n === 'idle_hand_on_chin'
                                                                        ? 3600
                                                                        : n === 'idle_rub_eyes'
                                                                          ? 3800
                                                                          : n === 'idle_sway_body'
                                                                            ? 5200
                                                                            : n ===
                                                                                'idle_stretch_arms_up'
                                                                              ? 4200
                                                                              : n ===
                                                                                  'idle_rotate_shoulders'
                                                                                ? 3200
                                                                                : n ===
                                                                                    'idle_wrist_roll'
                                                                                  ? 3000
                                                                                  : n ===
                                                                                      'idle_check_hand'
                                                                                    ? 3600
                                                                                    : n ===
                                                                                        'idle_bounce_knee'
                                                                                      ? 4200
                                                                                      : n ===
                                                                                            'yawn' ||
                                                                                          n ===
                                                                                            'idle_yawn'
                                                                                        ? 5200
                                                                                        : n ===
                                                                                            'idle_squat_think'
                                                                                          ? 7800
                                                                                          : n ===
                                                                                              'play_hair'
                                                                                            ? 4200
                                                                                            : n ===
                                                                                                'idle_shift_weight'
                                                                                              ? 4600
                                                                                              : 1200;
  const seed = Math.random();
  proceduralMotion = {
    name: n,
    startedAt: Date.now(),
    duration,
    seed,
    side: seed < 0.5 ? 'left' : 'right',
    intensity: (n.startsWith('idle_') ? 0.72 : 0.85) + seed * (n.startsWith('idle_') ? 0.22 : 0.3)
  };
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
  if (!idleState.nextAt) scheduleNextIdle(props.isTired ? 500 : 6500, props.isTired ? 1800 : 14500);
  if (Date.now() < idleState.nextAt) return;

  const persona = String(props.personaText || '').toLowerCase();
  const isLazy = /(懒散|慵懒|懒|lazy|sleepy|tired)/i.test(persona);
  const isDiligent = /(勤勉|严谨|理性|认真|目标导向|diligent|rational|strict|disciplined)/i.test(
    persona
  );
  const isTeasing = /(狡黠|爱逗人|调侃|优雅|掌控|teas|mischiev|elegan|control)/i.test(persona);
  const isCold = /(高冷|冷淡|沉默|寡言|quiet|cold)/i.test(persona);
  const isCheerful = /(元气|活泼|开朗|随性|调皮|cheer|lively|playful|free-spirited)/i.test(persona);
  const isGentle = /(温柔|治愈|体贴|gentle|soft|kind|healing)/i.test(persona);
  const isElegant = /(优雅|高贵|端庄|从容|elegan|grace|refined|poised)/i.test(persona);
  const isShy = /(害羞|腼腆|内向|shy|timid|bashful)/i.test(persona);
  const isBold = /(自信|张扬|强势|霸气|confident|bold|dominant)/i.test(persona);
  const isWarrior = /(战斗|武|剑|弓|枪|骑士|武士|soldier|warrior|knight|fighter)/i.test(persona);
  const isMystic = /(神秘|巫女|妖|狐|仙|魔法|mystic|mage|divine|fox)/i.test(persona);

  let pool: string[] = [
    'idle_shift_weight',
    'idle_shift_weight',
    'idle_head_tilt',
    'idle_head_tilt',
    'idle_look_around',
    'idle_think',
    'idle_shrug',
    'idle_sigh',
    'idle_adjust_clothes',
    'idle_yawn',
    'idle_fidget_hands',
    'idle_tap_foot',
    'play_hair',
    'idle_breathe_deep',
    'idle_lean',
    'idle_touch_face',
    'idle_hand_on_chin',
    'idle_wrist_roll',
    'idle_rotate_shoulders',
    'idle_sway_body',
    'stretch',
    'idle_stretch_arms_up'
  ];

  if (isLazy) {
    pool = [
      'idle_yawn',
      'idle_yawn',
      'idle_sigh',
      'idle_sigh',
      'idle_head_tilt',
      'idle_shift_weight',
      'idle_shift_weight',
      'idle_stretch_neck',
      'idle_breathe_deep',
      'idle_breathe_deep',
      'idle_lean',
      'idle_sway_body',
      'idle_touch_face',
      'idle_rub_eyes',
      'idle_wrist_roll',
      'idle_bounce_knee',
      'idle_fidget_hands',
      'stretch'
    ];
  } else if (isDiligent) {
    pool = [
      'idle_shift_weight',
      'idle_shift_weight',
      'idle_think',
      'idle_think',
      'idle_hand_on_chin',
      'idle_look_around',
      'idle_adjust_clothes',
      'idle_adjust_clothes',
      'idle_check_hand',
      'idle_breathe_deep',
      'idle_head_tilt',
      'idle_rotate_shoulders',
      'idle_wrist_roll',
      'idle_fidget_hands',
      'stretch',
      'idle_stretch_arms_up'
    ];
  } else if (isTeasing) {
    pool = [
      'idle_head_tilt',
      'idle_head_tilt',
      'play_hair',
      'play_hair',
      'idle_adjust_hair',
      'idle_shrug',
      'idle_look_around',
      'idle_check_nails',
      'idle_touch_face',
      'idle_sigh',
      'idle_adjust_clothes',
      'idle_wrist_roll',
      'idle_lean',
      'stretch'
    ];
  } else if (isCold) {
    pool = [
      'idle_arms_cross',
      'idle_arms_cross',
      'idle_hands_on_hips',
      'idle_think',
      'idle_hand_on_chin',
      'idle_look_around',
      'idle_lean',
      'idle_sway_body',
      'idle_sigh',
      'idle_shift_weight',
      'idle_rotate_shoulders'
    ];
  } else if (isCheerful) {
    pool = [
      'idle_shift_weight',
      'idle_shift_weight',
      'idle_look_around',
      'idle_head_tilt',
      'idle_tap_foot',
      'idle_bounce_knee',
      'idle_wrist_roll',
      'idle_sway_body',
      'stretch',
      'stretch',
      'idle_shrug',
      'idle_stretch_arms_up'
    ];
  } else if (isGentle) {
    pool = [
      'idle_head_tilt',
      'idle_head_tilt',
      'idle_sigh',
      'idle_sigh',
      'idle_adjust_clothes',
      'idle_touch_face',
      'idle_rub_neck',
      'idle_breathe_deep',
      'idle_shift_weight',
      'idle_sway_body',
      'idle_wrist_roll'
    ];
  }

  if (isElegant) {
    pool.push(
      'idle_check_nails',
      'idle_adjust_hair',
      'idle_adjust_hair',
      'idle_touch_face',
      'idle_lean',
      'idle_head_tilt',
      'idle_wrist_roll'
    );
  }
  if (isShy) {
    pool.push(
      'idle_touch_face',
      'idle_touch_face',
      'idle_hand_on_chin',
      'idle_fidget_hands',
      'idle_shift_weight',
      'idle_look_around'
    );
  }
  if (isBold) {
    pool.push(
      'idle_hands_on_hips',
      'idle_hands_on_hips',
      'idle_rotate_shoulders',
      'idle_stretch_arms_up',
      'stretch'
    );
  }
  if (isWarrior) {
    pool.push(
      'idle_rotate_shoulders',
      'idle_rotate_shoulders',
      'idle_stretch_arms_up',
      'idle_sway_body',
      'idle_shift_weight'
    );
  }
  if (isMystic) {
    pool.push(
      'idle_look_around',
      'idle_head_tilt',
      'idle_lean',
      'idle_touch_face',
      'idle_check_hand'
    );
  }

  if (props.isTired) {
    pool.push(
      'idle_squat_think',
      'idle_squat_think',
      'idle_sigh',
      'idle_breathe_deep',
      'idle_rub_eyes',
      'idle_rub_eyes'
    );
  }
  const candidates = pool.filter((n) => n !== idleState.lastName);
  const pickFrom = candidates.length ? candidates : pool;
  const name = pickFrom[Math.floor(Math.random() * pickFrom.length)] || 'idle_yawn';
  idleState.lastName = name;
  startProceduralMotion(name);
  scheduleNextIdle(props.isTired ? 900 : 6500, props.isTired ? 2600 : 14500);
};

const applyBaselineMotion = (t: number, delta: number) => {
  if (proceduralMotion) return;
  if (activeAction && activeAction.isRunning()) return;
  if (!motionNodes.base) return;

  const spine = motionNodes.spine;
  const chest = motionNodes.chest;
  const hips = motionNodes.hips;
  const lUpper = motionNodes.leftUpperArm;
  const rUpper = motionNodes.rightUpperArm;
  const rUpperLeg = motionNodes.rightUpperLeg;
  const rLowerLeg = motionNodes.rightLowerLeg;
  const lUpperLeg = motionNodes.leftUpperLeg;
  const lLowerLeg = motionNodes.leftLowerLeg;

  const baseSpine = motionNodes.base['spine'];
  const baseChest = motionNodes.base['chest'];
  const baseHips = motionNodes.base['hips'];
  const baseLU = motionNodes.base['leftUpperArm'];
  const baseRU = motionNodes.base['rightUpperArm'];
  const baseRULeg = motionNodes.base['rightUpperLeg'];
  const baseRLLeg = motionNodes.base['rightLowerLeg'];
  const baseLULeg = motionNodes.base['leftUpperLeg'];
  const baseLLLeg = motionNodes.base['leftLowerLeg'];

  const s = 1 - Math.exp(-Math.max(0, delta) * 7.5);
  const breathe = Math.sin(t * 1.25);
  const sway = Math.sin(t * 0.95 + 0.6);

  if (hips && baseHips) {
    hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, baseHips.y + sway * 0.035, s);
    hips.rotation.z = THREE.MathUtils.lerp(hips.rotation.z, baseHips.z + sway * 0.02, s);
  }
  if (spine && baseSpine) {
    spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, baseSpine.x + breathe * 0.02, s);
    spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, baseSpine.z - sway * 0.025, s);
  }
  if (chest && baseChest) {
    chest.rotation.x = THREE.MathUtils.lerp(chest.rotation.x, baseChest.x + breathe * 0.012, s);
    chest.rotation.y = THREE.MathUtils.lerp(chest.rotation.y, baseChest.y + sway * 0.015, s);
  }

  if (lUpper && baseLU) {
    lUpper.rotation.x = THREE.MathUtils.lerp(lUpper.rotation.x, baseLU.x + breathe * 0.01, s);
  }
  if (rUpper && baseRU) {
    rUpper.rotation.x = THREE.MathUtils.lerp(rUpper.rotation.x, baseRU.x + breathe * 0.01, s);
  }

  if (!!props.isMoving) {
    const persona = String(props.personaText || '').toLowerCase();
    const isLazy = /(懒散|慵懒|懒|lazy|sleepy|tired)/i.test(persona);
    const isElegant = /(优雅|高贵|端庄|从容|elegan|grace|refined|poised)/i.test(persona);
    const isWarrior = /(战斗|武|剑|弓|枪|骑士|武士|soldier|warrior|knight|fighter)/i.test(persona);

    const baseStepHz = isElegant ? 2.3 : isWarrior ? 4.4 : 3.5;
    const stepHz = baseStepHz * (isLazy ? 0.72 : 1) * (props.isTired ? 0.7 : 1);
    const phase = t * (Math.PI * 2) * stepHz;
    const stride = Math.sin(phase);
    const lift = Math.max(0, Math.sin(phase + Math.PI / 2));
    const ampUpper = (isElegant ? 0.14 : 0.22) * (isLazy ? 0.75 : 1);
    const ampLower = (isElegant ? 0.18 : 0.28) * (isLazy ? 0.75 : 1);

    if (rUpperLeg && baseRULeg) {
      rUpperLeg.rotation.x = THREE.MathUtils.lerp(
        rUpperLeg.rotation.x,
        baseRULeg.x + stride * ampUpper,
        s
      );
    }
    if (lUpperLeg && baseLULeg) {
      lUpperLeg.rotation.x = THREE.MathUtils.lerp(
        lUpperLeg.rotation.x,
        baseLULeg.x - stride * ampUpper,
        s
      );
    }

    if (rLowerLeg && baseRLLeg) {
      rLowerLeg.rotation.x = THREE.MathUtils.lerp(
        rLowerLeg.rotation.x,
        baseRLLeg.x - lift * ampLower,
        s
      );
    }
    if (lLowerLeg && baseLLLeg) {
      lLowerLeg.rotation.x = THREE.MathUtils.lerp(
        lLowerLeg.rotation.x,
        baseLLLeg.x - Math.max(0, Math.sin(phase + Math.PI / 2 + Math.PI)) * ampLower,
        s
      );
    }

    if (hips && baseHips) {
      const bob = Math.abs(stride) * 0.008;
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, bob, s);
    }
  } else {
    if (hips) hips.position.y = THREE.MathUtils.lerp(hips.position.y, 0, s);
  }
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
  const intensity = proceduralMotion.intensity || 1;
  const dir = proceduralMotion.side === 'left' ? 1 : -1;

  const rUpper = motionNodes.rightUpperArm;
  const rLower = motionNodes.rightLowerArm;
  const rHand = motionNodes.rightHand;
  const lUpper = motionNodes.leftUpperArm;
  const lLower = motionNodes.leftLowerArm;
  const lHand = motionNodes.leftHand;
  const lShoulder = motionNodes.leftShoulder;
  const rShoulder = motionNodes.rightShoulder;

  const baseRU = proceduralBase['rightUpperArm'] || motionNodes.base['rightUpperArm'];
  const baseRL = proceduralBase['rightLowerArm'] || motionNodes.base['rightLowerArm'];
  const baseRH = proceduralBase['rightHand'] || motionNodes.base['rightHand'];
  const baseLU = proceduralBase['leftUpperArm'] || motionNodes.base['leftUpperArm'];
  const baseLL = proceduralBase['leftLowerArm'] || motionNodes.base['leftLowerArm'];
  const baseLH = proceduralBase['leftHand'] || motionNodes.base['leftHand'];
  const baseLS = proceduralBase['leftShoulder'] || motionNodes.base['leftShoulder'];
  const baseRS = proceduralBase['rightShoulder'] || motionNodes.base['rightShoulder'];
  const hips = motionNodes.hips;
  const spine = motionNodes.spine;
  const chest = motionNodes.chest;
  const rUpperLeg = motionNodes.rightUpperLeg;
  const rLowerLeg = motionNodes.rightLowerLeg;
  const lUpperLeg = motionNodes.leftUpperLeg;
  const lLowerLeg = motionNodes.leftLowerLeg;
  const baseHips = proceduralBase['hips'] || motionNodes.base['hips'];
  const baseSpine = proceduralBase['spine'] || motionNodes.base['spine'];
  const baseChest = proceduralBase['chest'] || motionNodes.base['chest'];
  const baseRULeg = proceduralBase['rightUpperLeg'] || motionNodes.base['rightUpperLeg'];
  const baseRLLeg = proceduralBase['rightLowerLeg'] || motionNodes.base['rightLowerLeg'];
  const baseLULeg = proceduralBase['leftUpperLeg'] || motionNodes.base['leftUpperLeg'];
  const baseLLLeg = proceduralBase['leftLowerLeg'] || motionNodes.base['leftLowerLeg'];

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
  } else if (name === 'shake') {
    const headBase = lookNodes.base.head;
    const neckBase = lookNodes.base.neck;
    const shake = Math.sin(Math.PI * 10 * p) * 0.18 * k * intensity;
    if (lookNodes.head && headBase) {
      lookNodes.head.rotation.y = headBase.y + shake;
      lookNodes.head.rotation.z = headBase.z + shake * 0.5;
    }
    if (lookNodes.neck && neckBase) {
      lookNodes.neck.rotation.y = neckBase.y + shake * 0.65;
    }
    if (hips && baseHips) {
      hips.rotation.z = baseHips.z + shake * 0.35;
      hips.rotation.y = baseHips.y + shake * 0.25;
    }
    if (spine && baseSpine) spine.rotation.z = baseSpine.z - shake * 0.25;
    if (chest && baseChest) chest.rotation.z = baseChest.z - shake * 0.12;
  } else if (name === 'tilt_left' || name === 'tilt_right') {
    const headBase = lookNodes.base.head;
    const neckBase = lookNodes.base.neck;
    const sign = name === 'tilt_left' ? 1 : -1;
    const ease = Math.sin(Math.PI * p);
    const tilt = Math.sin(Math.PI * 2 * p) * 0.28 * ease * sign;
    if (lookNodes.head && headBase) lookNodes.head.rotation.z = headBase.z + tilt;
    if (lookNodes.neck && neckBase) lookNodes.neck.rotation.z = neckBase.z + tilt * 0.6;
    if (lShoulder && baseLS) lShoulder.rotation.z = baseLS.z + tilt * 0.2;
    if (rShoulder && baseRS) rShoulder.rotation.z = baseRS.z - tilt * 0.2;
  } else if (name === 'tap_body') {
    const ease = Math.sin(Math.PI * p);
    const beat = Math.abs(Math.sin(Math.PI * 4 * p)) * ease;
    if (spine && baseSpine) spine.rotation.x = baseSpine.x - 0.08 * beat * intensity;
    if (chest && baseChest) chest.rotation.x = baseChest.x - 0.04 * beat * intensity;
    if (hips && baseHips) hips.rotation.y = baseHips.y + 0.08 * Math.sin(Math.PI * 2 * p) * ease;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.08 * ease;
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.08 * Math.sin(Math.PI * 2 * p) * ease;
    }
    if (lUpper && baseLU) lUpper.rotation.z = baseLU.z - 0.08 * beat;
    if (rUpper && baseRU) rUpper.rotation.z = baseRU.z + 0.08 * beat;
  } else if (name === 'flick_head') {
    const headBase = lookNodes.base.head;
    const neckBase = lookNodes.base.neck;
    const ease = Math.sin(Math.PI * p);
    const pet = Math.sin(Math.PI * 2 * p) * 0.22 * ease;
    if (lookNodes.head && headBase) {
      lookNodes.head.rotation.x = headBase.x + 0.18 * ease;
      lookNodes.head.rotation.y = headBase.y + pet * 0.35;
      lookNodes.head.rotation.z = headBase.z - pet * 0.2 * dir;
    }
    if (lookNodes.neck && neckBase) {
      lookNodes.neck.rotation.x = neckBase.x + 0.08 * ease;
      lookNodes.neck.rotation.y = neckBase.y + pet * 0.2;
    }
    if (lShoulder && baseLS) lShoulder.rotation.x = baseLS.x + 0.06 * ease;
    if (rShoulder && baseRS) rShoulder.rotation.x = baseRS.x + 0.06 * ease;
  } else if (name === 'head_hit') {
    const ease = Math.sin(Math.PI * p);
    const snap = Math.sin(Math.PI * 2.6 * p) * ease;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x - 0.22 * ease - 0.06 * snap;
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.08 * snap * dir;
      lookNodes.head.rotation.z = lookNodes.base.head.z + 0.12 * ease * dir;
    }
    if (lookNodes.neck && lookNodes.base.neck) {
      lookNodes.neck.rotation.x = lookNodes.base.neck.x - 0.1 * ease;
      lookNodes.neck.rotation.y = lookNodes.base.neck.y + 0.05 * snap * dir;
    }
    if (spine && baseSpine) spine.rotation.x = baseSpine.x + 0.06 * ease;
    if (chest && baseChest) chest.rotation.x = baseChest.x + 0.04 * ease;
    if (hips && baseHips) hips.rotation.z = baseHips.z - 0.06 * ease * dir;
  } else if (name === 'crouch') {
    const ease = Math.sin(Math.PI * p);
    const hold =
      THREE.MathUtils.clamp((p - 0.12) / 0.22, 0, 1) *
      THREE.MathUtils.clamp((0.92 - p) / 0.22, 0, 1);
    const squat = ease * (0.75 + 0.25 * hold);
    if (hips && baseHips) hips.rotation.x = baseHips.x + 0.22 * squat;
    if (spine && baseSpine) spine.rotation.x = baseSpine.x - 0.08 * squat;
    if (chest && baseChest) chest.rotation.x = baseChest.x - 0.04 * squat;
    if (lUpperLeg && baseLULeg) lUpperLeg.rotation.x = baseLULeg.x - 0.5 * squat;
    if (rUpperLeg && baseRULeg) rUpperLeg.rotation.x = baseRULeg.x - 0.5 * squat;
    if (lLowerLeg && baseLLLeg) lLowerLeg.rotation.x = baseLLLeg.x + 0.82 * squat;
    if (rLowerLeg && baseRLLeg) rLowerLeg.rotation.x = baseRLLeg.x + 0.82 * squat;
    if (lookNodes.head && lookNodes.base.head)
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.06 * squat;
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
  } else if (name === 'point_left' || name === 'point_right') {
    const ease = Math.sin(Math.PI * p);
    const arm = name === 'point_left' ? lUpper : rUpper;
    const fore = name === 'point_left' ? lLower : rLower;
    const hand = name === 'point_left' ? lHand : rHand;
    const baseArm = name === 'point_left' ? baseLU : baseRU;
    const baseFore = name === 'point_left' ? baseLL : baseRL;
    const baseHand = name === 'point_left' ? baseLH : baseRH;
    const sign = name === 'point_left' ? 1 : -1;
    if (arm && baseArm) {
      arm.rotation.x = baseArm.x - 0.45 * ease;
      arm.rotation.z = baseArm.z - 0.5 * ease * sign;
      arm.rotation.y = baseArm.y + 0.2 * ease * sign;
    }
    if (fore && baseFore) fore.rotation.z = baseFore.z - 0.18 * ease * sign;
    if (hand && baseHand) {
      hand.rotation.y = baseHand.y + 0.22 * ease * sign;
      hand.rotation.x = baseHand.x + 0.08 * ease;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.22 * ease * sign;
      lookNodes.head.rotation.x = lookNodes.base.head.x - 0.04 * ease;
    }
  } else if (name === 'happy' || name === 'friend' || name === 'mood_happy') {
    const ease = Math.sin(Math.PI * p);
    const bounce = Math.abs(Math.sin(Math.PI * 6 * p)) * ease;
    if (hips && baseHips) hips.rotation.y = baseHips.y + 0.08 * Math.sin(Math.PI * 2 * p) * ease;
    if (spine && baseSpine) spine.rotation.x = baseSpine.x - 0.05 * bounce;
    if (chest && baseChest) chest.rotation.x = baseChest.x - 0.03 * bounce;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x - 0.06 * ease;
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.12 * Math.sin(Math.PI * 2 * p) * ease;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.45 * ease;
      rUpper.rotation.z = baseRU.z - 0.18 * ease;
    }
    if (rHand && baseRH) rHand.rotation.y = baseRH.y + 0.35 * Math.sin(Math.PI * 6 * p) * ease;
  } else if (name === 'mood_angry') {
    const ease = Math.sin(Math.PI * p);
    const headBase = lookNodes.base.head;
    const neckBase = lookNodes.base.neck;
    const shake = Math.sin(Math.PI * 8 * p) * 0.28 * ease * intensity;
    if (lookNodes.head && headBase) {
      lookNodes.head.rotation.y = headBase.y + shake;
      lookNodes.head.rotation.x = headBase.x + 0.06 * ease;
    }
    if (lookNodes.neck && neckBase) lookNodes.neck.rotation.y = neckBase.y + shake * 0.55;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.25 * ease;
      lUpper.rotation.z = baseLU.z + 0.4 * ease;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.25 * ease;
      rUpper.rotation.z = baseRU.z - 0.4 * ease;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z + 0.35 * ease;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z - 0.35 * ease;
    if (spine && baseSpine) spine.rotation.z = baseSpine.z - 0.05 * ease * dir;
  } else if (name === 'activity') {
    const ease = Math.sin(Math.PI * p);
    const swing = Math.sin(Math.PI * 4 * p) * ease;
    if (hips && baseHips) hips.rotation.y = baseHips.y + 0.08 * swing;
    if (spine && baseSpine) spine.rotation.z = baseSpine.z - 0.05 * swing;
    if (chest && baseChest) chest.rotation.z = baseChest.z - 0.03 * swing;
    if (lUpper && baseLU) lUpper.rotation.x = baseLU.x - 0.12 * ease;
    if (rUpper && baseRU) rUpper.rotation.x = baseRU.x - 0.12 * ease;
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
  } else if (name === 'idle_head_tilt') {
    const ease = Math.sin(Math.PI * p);
    const tilt = Math.sin(Math.PI * 2 * p) * 0.22 * ease;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.z = lookNodes.base.head.z + tilt;
    }
    if (lookNodes.neck && lookNodes.base.neck) {
      lookNodes.neck.rotation.z = lookNodes.base.neck.z + tilt * 0.55;
    }
    if (lShoulder && baseLS) lShoulder.rotation.z = baseLS.z + tilt * 0.22;
    if (rShoulder && baseRS) rShoulder.rotation.z = baseRS.z - tilt * 0.22;
  } else if (name === 'idle_shrug') {
    const ease = Math.sin(Math.PI * p);
    if (lShoulder && baseLS) {
      lShoulder.rotation.x = baseLS.x + 0.22 * ease;
      lShoulder.rotation.z = baseLS.z + 0.08 * ease;
    }
    if (rShoulder && baseRS) {
      rShoulder.rotation.x = baseRS.x + 0.22 * ease;
      rShoulder.rotation.z = baseRS.z - 0.08 * ease;
    }
    if (lUpper && baseLU) lUpper.rotation.x = baseLU.x - 0.08 * ease;
    if (rUpper && baseRU) rUpper.rotation.x = baseRU.x - 0.08 * ease;
    if (spine && baseSpine)
      spine.rotation.z = baseSpine.z + Math.sin(Math.PI * 2 * p) * 0.03 * ease;
  } else if (name === 'idle_sigh') {
    const ease = Math.sin(Math.PI * p);
    const slow = Math.sin(Math.PI * 1.2 * p) * ease;
    if (chest && baseChest) chest.rotation.x = baseChest.x + 0.09 * ease;
    if (spine && baseSpine) spine.rotation.x = baseSpine.x + 0.06 * ease;
    if (hips && baseHips) hips.rotation.z = baseHips.z + 0.03 * slow;
    if (lShoulder && baseLS) lShoulder.rotation.x = baseLS.x + 0.12 * ease;
    if (rShoulder && baseRS) rShoulder.rotation.x = baseRS.x + 0.12 * ease;
  } else if (name === 'idle_fidget_hands') {
    const ease = Math.sin(Math.PI * p);
    const f = Math.sin(Math.PI * 4.2 * p) * ease;
    const drift = Math.sin(Math.PI * 1.2 * p) * ease;
    if (lLower && baseLL) lLower.rotation.z = baseLL.z - 0.08 * f;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z + 0.08 * f;
    if (lHand && baseLH) {
      lHand.rotation.y = baseLH.y + 0.18 * f;
      lHand.rotation.x = baseLH.x + 0.06 * drift;
    }
    if (rHand && baseRH) {
      rHand.rotation.y = baseRH.y - 0.18 * f;
      rHand.rotation.x = baseRH.x + 0.06 * drift;
    }
    if (lUpper && baseLU) lUpper.rotation.x = baseLU.x - 0.04 * drift;
    if (rUpper && baseRU) rUpper.rotation.x = baseRU.x - 0.04 * drift;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.04 * f;
    }
  } else if (name === 'idle_check_nails') {
    const ease = Math.sin(Math.PI * p);
    const settle =
      THREE.MathUtils.clamp(p / 0.22, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.22, 0, 1);
    const hold = ease * (0.7 + 0.3 * settle);
    if (lShoulder && baseLS) lShoulder.rotation.x = baseLS.x + 0.06 * hold;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.36 * hold;
      lUpper.rotation.z = baseLU.z - 0.12 * hold;
      lUpper.rotation.y = baseLU.y + 0.18 * hold;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z - 0.62 * hold;
    if (lHand && baseLH) {
      lHand.rotation.x = baseLH.x + 0.18 * hold;
      lHand.rotation.y = baseLH.y + 0.12 * Math.sin(Math.PI * 2.2 * p) * ease;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y - 0.16 * hold;
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.08 * hold;
      lookNodes.head.rotation.z = lookNodes.base.head.z - 0.06 * hold;
    }
    if (lookNodes.neck && lookNodes.base.neck) {
      lookNodes.neck.rotation.y = lookNodes.base.neck.y - 0.09 * hold;
      lookNodes.neck.rotation.x = lookNodes.base.neck.x + 0.05 * hold;
    }
  } else if (name === 'idle_tap_foot') {
    const ease = Math.sin(Math.PI * p);
    const tap = Math.abs(Math.sin(Math.PI * 5.4 * p)) * ease;
    const sway = Math.sin(Math.PI * 1.2 * p) * ease;
    if (rUpperLeg && baseRULeg) rUpperLeg.rotation.x = baseRULeg.x - 0.12 * tap;
    if (rLowerLeg && baseRLLeg) rLowerLeg.rotation.x = baseRLLeg.x + 0.18 * tap;
    if (hips && baseHips) {
      hips.rotation.y = baseHips.y + 0.05 * sway;
      hips.rotation.z = baseHips.z - 0.03 * sway;
    }
    if (spine && baseSpine) spine.rotation.z = baseSpine.z + 0.02 * sway;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.06 * sway;
    }
  } else if (name === 'idle_rub_neck') {
    const ease = Math.sin(Math.PI * p);
    const settle =
      THREE.MathUtils.clamp(p / 0.22, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.22, 0, 1);
    const hold = ease * (0.7 + 0.3 * settle);
    const rub = Math.sin(Math.PI * 4.6 * p) * ease;
    if (rShoulder && baseRS) {
      rShoulder.rotation.x = baseRS.x + 0.1 * hold;
      rShoulder.rotation.z = baseRS.z + 0.06 * hold;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.62 * hold;
      rUpper.rotation.z = baseRU.z + 0.26 * hold;
      rUpper.rotation.y = baseRU.y - 0.12 * hold;
    }
    if (rLower && baseRL) {
      rLower.rotation.z = baseRL.z + 0.78 * hold;
      rLower.rotation.x = baseRL.x + 0.12 * rub;
    }
    if (rHand && baseRH) {
      rHand.rotation.x = baseRH.x + 0.2 * hold;
      rHand.rotation.y = baseRH.y - 0.12 * hold;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.z = lookNodes.base.head.z + 0.12 * hold;
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.08 * hold;
    }
    if (lookNodes.neck && lookNodes.base.neck) {
      lookNodes.neck.rotation.z = lookNodes.base.neck.z + 0.08 * hold;
    }
    if (chest && baseChest) chest.rotation.z = baseChest.z + 0.02 * hold;
  } else if (name === 'idle_breathe_deep') {
    const ease = Math.sin(Math.PI * p);
    const breath = Math.sin(Math.PI * 2 * p) * 0.5 + 0.5;
    const inhale = breath * ease;
    if (chest && baseChest) chest.rotation.x = baseChest.x + 0.14 * inhale;
    if (spine && baseSpine) spine.rotation.x = baseSpine.x + 0.09 * inhale;
    if (lShoulder && baseLS) lShoulder.rotation.x = baseLS.x + 0.1 * inhale;
    if (rShoulder && baseRS) rShoulder.rotation.x = baseRS.x + 0.1 * inhale;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x - 0.04 * inhale;
    }
  } else if (name === 'idle_lean') {
    const ease = Math.sin(Math.PI * p);
    const lean = Math.sin(Math.PI * 2 * p) * 0.16 * ease;
    if (hips && baseHips) hips.rotation.z = baseHips.z + lean;
    if (spine && baseSpine) spine.rotation.z = baseSpine.z - lean * 0.55;
    if (chest && baseChest) chest.rotation.z = baseChest.z - lean * 0.25;
    if (lShoulder && baseLS) lShoulder.rotation.z = baseLS.z + lean * 0.12;
    if (rShoulder && baseRS) rShoulder.rotation.z = baseRS.z + lean * 0.12;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.z = lookNodes.base.head.z - lean * 0.45;
    }
  } else if (name === 'idle_look_around') {
    const ease = Math.sin(Math.PI * p);
    const gaze = Math.sin(Math.PI * 2 * p) * ease;
    const scan = Math.sin(Math.PI * 1.1 * p) * ease;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + gaze * 0.35;
      lookNodes.head.rotation.x = lookNodes.base.head.x + scan * 0.08;
    }
    if (lookNodes.neck && lookNodes.base.neck) {
      lookNodes.neck.rotation.y = lookNodes.base.neck.y + gaze * 0.2;
      lookNodes.neck.rotation.x = lookNodes.base.neck.x + scan * 0.05;
    }
    if (chest && baseChest) chest.rotation.y = baseChest.y + gaze * 0.06;
  } else if (name === 'idle_think') {
    const ease = Math.sin(Math.PI * p);
    const settle =
      THREE.MathUtils.clamp(p / 0.25, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.25, 0, 1);
    const hold = ease * (0.65 + 0.35 * settle);
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.55 * hold;
      rUpper.rotation.z = baseRU.z - 0.18 * hold;
      rUpper.rotation.y = baseRU.y - 0.22 * hold;
    }
    if (rLower && baseRL) {
      rLower.rotation.z = baseRL.z + 0.42 * hold;
      rLower.rotation.x = baseRL.x + 0.12 * hold;
    }
    if (rHand && baseRH) {
      rHand.rotation.x = baseRH.x + 0.25 * hold;
      rHand.rotation.y = baseRH.y - 0.18 * hold;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.08 * hold;
      lookNodes.head.rotation.y = lookNodes.base.head.y + Math.sin(Math.PI * 2 * p) * 0.07 * ease;
    }
    if (chest && baseChest) chest.rotation.x = baseChest.x + 0.03 * hold;
  } else if (name === 'idle_adjust_clothes') {
    const ease = Math.sin(Math.PI * p);
    const tug = Math.sin(Math.PI * 3 * p) * ease;
    if (lShoulder && baseLS) lShoulder.rotation.z = baseLS.z + 0.06 * tug;
    if (rShoulder && baseRS) rShoulder.rotation.z = baseRS.z - 0.06 * tug;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.22 * ease;
      lUpper.rotation.z = baseLU.z - 0.12 * ease;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.16 * ease;
      rUpper.rotation.z = baseRU.z + 0.06 * ease;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z - 0.18 * ease;
    if (lHand && baseLH) lHand.rotation.y = baseLH.y + 0.12 * tug;
    if (hips && baseHips) hips.rotation.y = baseHips.y + 0.04 * tug;
  } else if (name === 'idle_arms_cross') {
    const ease = Math.sin(Math.PI * p);
    const settle =
      THREE.MathUtils.clamp(p / 0.25, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.25, 0, 1);
    const hold = ease * (0.7 + 0.3 * settle);
    if (lShoulder && baseLS) lShoulder.rotation.x = baseLS.x + 0.08 * hold;
    if (rShoulder && baseRS) rShoulder.rotation.x = baseRS.x + 0.08 * hold;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.32 * hold;
      lUpper.rotation.z = baseLU.z - 0.58 * hold;
      lUpper.rotation.y = baseLU.y + 0.22 * hold;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.32 * hold;
      rUpper.rotation.z = baseRU.z + 0.58 * hold;
      rUpper.rotation.y = baseRU.y - 0.22 * hold;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z - 0.28 * hold;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z + 0.28 * hold;
    if (lookNodes.head && lookNodes.base.head)
      lookNodes.head.rotation.y = lookNodes.base.head.y + Math.sin(Math.PI * 2 * p) * 0.08 * ease;
  } else if (name === 'idle_hands_on_hips') {
    const ease = Math.sin(Math.PI * p);
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.22 * ease;
      lUpper.rotation.z = baseLU.z + 0.24 * ease;
      lUpper.rotation.y = baseLU.y - 0.12 * ease;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.22 * ease;
      rUpper.rotation.z = baseRU.z - 0.24 * ease;
      rUpper.rotation.y = baseRU.y + 0.12 * ease;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z + 0.18 * ease;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z - 0.18 * ease;
    if (hips && baseHips) hips.rotation.y = baseHips.y + Math.sin(Math.PI * 2 * p) * 0.1 * ease;
    if (spine && baseSpine)
      spine.rotation.z = baseSpine.z - Math.sin(Math.PI * 2 * p) * 0.04 * ease;
  } else if (name === 'idle_stretch_neck') {
    const ease = Math.sin(Math.PI * p);
    const roll = Math.sin(Math.PI * 2 * p) * ease;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + roll * 0.16;
      lookNodes.head.rotation.x = lookNodes.base.head.x + Math.sin(Math.PI * 1.5 * p) * 0.1 * ease;
      lookNodes.head.rotation.z = lookNodes.base.head.z + Math.sin(Math.PI * 1.2 * p) * 0.14 * ease;
    }
    if (lookNodes.neck && lookNodes.base.neck) {
      lookNodes.neck.rotation.y = lookNodes.base.neck.y + roll * 0.1;
      lookNodes.neck.rotation.z = lookNodes.base.neck.z + Math.sin(Math.PI * 1.2 * p) * 0.08 * ease;
    }
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
    if (hips && baseHips) hips.rotation.x = baseHips.x + 0.24 * squat;
    if (spine && baseSpine) spine.rotation.x = baseSpine.x - 0.08 * squat;
    if (chest && baseChest) chest.rotation.x = baseChest.x - 0.04 * squat;
    if (lUpperLeg && baseLULeg) lUpperLeg.rotation.x = baseLULeg.x - 0.52 * squat;
    if (rUpperLeg && baseRULeg) rUpperLeg.rotation.x = baseRULeg.x - 0.52 * squat;
    if (lLowerLeg && baseLLLeg) lLowerLeg.rotation.x = baseLLLeg.x + 0.86 * squat;
    if (rLowerLeg && baseRLLeg) rLowerLeg.rotation.x = baseRLLeg.x + 0.86 * squat;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.34 * squat;
      lUpper.rotation.z = baseLU.z - 0.26 * squat;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.34 * squat;
      rUpper.rotation.z = baseRU.z + 0.26 * squat;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z - 0.55 * squat;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z + 0.55 * squat;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.08 * squat;
      lookNodes.head.rotation.z = lookNodes.base.head.z + 0.12 * squat;
    }
  } else if (name === 'idle_touch_face') {
    const ease = Math.sin(Math.PI * p);
    const settle =
      THREE.MathUtils.clamp(p / 0.22, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.22, 0, 1);
    const hold = ease * (0.7 + 0.3 * settle) * intensity;
    const mainUpper = dir > 0 ? lUpper : rUpper;
    const mainLower = dir > 0 ? lLower : rLower;
    const mainHand = dir > 0 ? lHand : rHand;
    const baseU = dir > 0 ? baseLU : baseRU;
    const baseL = dir > 0 ? baseLL : baseRL;
    const baseH = dir > 0 ? baseLH : baseRH;
    if (mainUpper && baseU) {
      mainUpper.rotation.x = baseU.x - 0.52 * hold;
      mainUpper.rotation.z = baseU.z - 0.22 * hold * dir;
      mainUpper.rotation.y = baseU.y + 0.18 * hold * dir;
    }
    if (mainLower && baseL) {
      mainLower.rotation.z = baseL.z - 0.62 * hold * dir;
      mainLower.rotation.x = baseL.x + 0.08 * Math.sin(Math.PI * 3 * p) * ease * intensity;
    }
    if (mainHand && baseH) {
      mainHand.rotation.x = baseH.x + 0.22 * hold;
      mainHand.rotation.y = baseH.y + 0.14 * hold * dir;
      mainHand.rotation.z = baseH.z - 0.1 * hold * dir;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.12 * hold * dir;
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.05 * hold;
      lookNodes.head.rotation.z = lookNodes.base.head.z - 0.06 * hold * dir;
    }
    if (lookNodes.neck && lookNodes.base.neck) {
      lookNodes.neck.rotation.y = lookNodes.base.neck.y + 0.07 * hold * dir;
    }
  } else if (name === 'idle_adjust_hair') {
    const ease = Math.sin(Math.PI * p) * intensity;
    const sway = Math.sin(Math.PI * 2.1 * p) * ease;
    const mainUpper = dir > 0 ? lUpper : rUpper;
    const mainLower = dir > 0 ? lLower : rLower;
    const mainHand = dir > 0 ? lHand : rHand;
    const baseU = dir > 0 ? baseLU : baseRU;
    const baseL = dir > 0 ? baseLL : baseRL;
    const baseH = dir > 0 ? baseLH : baseRH;
    if (mainUpper && baseU) {
      mainUpper.rotation.x = baseU.x - 0.58 * ease;
      mainUpper.rotation.z = baseU.z - 0.34 * ease * dir;
    }
    if (mainLower && baseL) mainLower.rotation.z = baseL.z - 0.22 * ease * dir;
    if (mainHand && baseH) {
      mainHand.rotation.x = baseH.x + 0.2 * ease;
      mainHand.rotation.y = baseH.y + 0.26 * sway * dir;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.1 * sway;
      lookNodes.head.rotation.z = lookNodes.base.head.z - 0.07 * ease * dir;
    }
  } else if (name === 'idle_hand_on_chin') {
    const ease = Math.sin(Math.PI * p);
    const settle =
      THREE.MathUtils.clamp(p / 0.24, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.24, 0, 1);
    const hold = ease * (0.7 + 0.3 * settle) * intensity;
    const mainUpper = dir > 0 ? lUpper : rUpper;
    const mainLower = dir > 0 ? lLower : rLower;
    const mainHand = dir > 0 ? lHand : rHand;
    const baseU = dir > 0 ? baseLU : baseRU;
    const baseL = dir > 0 ? baseLL : baseRL;
    const baseH = dir > 0 ? baseLH : baseRH;
    if (mainUpper && baseU) {
      mainUpper.rotation.x = baseU.x - 0.62 * hold;
      mainUpper.rotation.z = baseU.z - 0.12 * hold * dir;
      mainUpper.rotation.y = baseU.y + 0.18 * hold * dir;
    }
    if (mainLower && baseL) {
      mainLower.rotation.z = baseL.z - 0.74 * hold * dir;
      mainLower.rotation.x = baseL.x + 0.12 * hold;
    }
    if (mainHand && baseH) {
      mainHand.rotation.x = baseH.x + 0.28 * hold;
      mainHand.rotation.y = baseH.y - 0.12 * hold * dir;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.12 * hold;
      lookNodes.head.rotation.y = lookNodes.base.head.y + Math.sin(Math.PI * 2 * p) * 0.06 * ease;
    }
    if (chest && baseChest) chest.rotation.x = baseChest.x + 0.04 * hold;
  } else if (name === 'idle_rub_eyes') {
    const ease = Math.sin(Math.PI * p);
    const settle =
      THREE.MathUtils.clamp(p / 0.22, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.22, 0, 1);
    const hold = ease * (0.7 + 0.3 * settle) * intensity;
    const rub = Math.sin(Math.PI * 5.2 * p) * ease * intensity;
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.62 * hold;
      lUpper.rotation.z = baseLU.z - 0.18 * hold;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.62 * hold;
      rUpper.rotation.z = baseRU.z + 0.18 * hold;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z - 0.88 * hold - 0.12 * rub;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z + 0.88 * hold + 0.12 * rub;
    if (lHand && baseLH) lHand.rotation.x = baseLH.x + 0.18 * hold;
    if (rHand && baseRH) rHand.rotation.x = baseRH.x + 0.18 * hold;
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.12 * hold;
      lookNodes.head.rotation.y = lookNodes.base.head.y + 0.05 * rub;
    }
    if (chest && baseChest) chest.rotation.x = baseChest.x - 0.04 * hold;
  } else if (name === 'idle_sway_body') {
    const ease = Math.sin(Math.PI * p);
    const sway = Math.sin(Math.PI * 2 * p) * 0.12 * ease * intensity;
    const twist = Math.sin(Math.PI * 1.2 * p) * 0.08 * ease * intensity;
    if (hips && baseHips) {
      hips.rotation.z = baseHips.z + sway;
      hips.rotation.y = baseHips.y + twist;
    }
    if (spine && baseSpine) {
      spine.rotation.z = baseSpine.z - sway * 0.65;
      spine.rotation.y = baseSpine.y - twist * 0.55;
    }
    if (chest && baseChest) {
      chest.rotation.z = baseChest.z - sway * 0.35;
      chest.rotation.y = baseChest.y - twist * 0.35;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.z = lookNodes.base.head.z - sway * 0.45;
      lookNodes.head.rotation.y = lookNodes.base.head.y + twist * 0.35;
    }
  } else if (name === 'idle_stretch_arms_up') {
    const ease = Math.sin(Math.PI * p) * intensity;
    const reach =
      THREE.MathUtils.clamp(p / 0.35, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.35, 0, 1);
    const hold = ease * (0.75 + 0.25 * reach);
    if (lUpper && baseLU) {
      lUpper.rotation.x = baseLU.x - 0.78 * hold;
      lUpper.rotation.z = baseLU.z + 0.22 * hold;
    }
    if (rUpper && baseRU) {
      rUpper.rotation.x = baseRU.x - 0.78 * hold;
      rUpper.rotation.z = baseRU.z - 0.22 * hold;
    }
    if (lLower && baseLL) lLower.rotation.z = baseLL.z + 0.12 * hold;
    if (rLower && baseRL) rLower.rotation.z = baseRL.z - 0.12 * hold;
    if (chest && baseChest) chest.rotation.x = baseChest.x - 0.05 * hold;
    if (spine && baseSpine) spine.rotation.x = baseSpine.x - 0.04 * hold;
    if (lookNodes.head && lookNodes.base.head)
      lookNodes.head.rotation.x = lookNodes.base.head.x - 0.06 * hold;
  } else if (name === 'idle_rotate_shoulders') {
    const ease = Math.sin(Math.PI * p) * intensity;
    const roll = Math.sin(Math.PI * 2.4 * p) * ease;
    if (lShoulder && baseLS) {
      lShoulder.rotation.x = baseLS.x + 0.18 * ease;
      lShoulder.rotation.z = baseLS.z + 0.12 * roll;
    }
    if (rShoulder && baseRS) {
      rShoulder.rotation.x = baseRS.x + 0.18 * ease;
      rShoulder.rotation.z = baseRS.z - 0.12 * roll;
    }
    if (spine && baseSpine) spine.rotation.z = baseSpine.z + 0.03 * roll;
    if (chest && baseChest) chest.rotation.z = baseChest.z + 0.02 * roll;
  } else if (name === 'idle_wrist_roll') {
    const ease = Math.sin(Math.PI * p) * intensity;
    const roll = Math.sin(Math.PI * 4 * p) * ease;
    if (lHand && baseLH) {
      lHand.rotation.y = baseLH.y + 0.38 * roll;
      lHand.rotation.x = baseLH.x + 0.12 * ease;
    }
    if (rHand && baseRH) {
      rHand.rotation.y = baseRH.y - 0.38 * roll;
      rHand.rotation.x = baseRH.x + 0.12 * ease;
    }
    if (lLower && baseLL) lLower.rotation.x = baseLL.x + 0.06 * roll;
    if (rLower && baseRL) rLower.rotation.x = baseRL.x - 0.06 * roll;
  } else if (name === 'idle_check_hand') {
    const ease = Math.sin(Math.PI * p);
    const settle =
      THREE.MathUtils.clamp(p / 0.22, 0, 1) * THREE.MathUtils.clamp((1 - p) / 0.22, 0, 1);
    const hold = ease * (0.7 + 0.3 * settle) * intensity;
    const mainUpper = dir > 0 ? lUpper : rUpper;
    const mainLower = dir > 0 ? lLower : rLower;
    const mainHand = dir > 0 ? lHand : rHand;
    const baseU = dir > 0 ? baseLU : baseRU;
    const baseL = dir > 0 ? baseLL : baseRL;
    const baseH = dir > 0 ? baseLH : baseRH;
    if (mainUpper && baseU) {
      mainUpper.rotation.x = baseU.x - 0.38 * hold;
      mainUpper.rotation.z = baseU.z - 0.22 * hold * dir;
      mainUpper.rotation.y = baseU.y + 0.12 * hold * dir;
    }
    if (mainLower && baseL) mainLower.rotation.z = baseL.z - 0.58 * hold * dir;
    if (mainHand && baseH) {
      mainHand.rotation.x = baseH.x + 0.16 * hold;
      mainHand.rotation.y = baseH.y + 0.18 * Math.sin(Math.PI * 2.2 * p) * ease * dir;
    }
    if (lookNodes.head && lookNodes.base.head) {
      lookNodes.head.rotation.y = lookNodes.base.head.y - 0.2 * hold * dir;
      lookNodes.head.rotation.x = lookNodes.base.head.x + 0.08 * hold;
    }
    if (lookNodes.neck && lookNodes.base.neck)
      lookNodes.neck.rotation.y = lookNodes.base.neck.y - 0.12 * hold * dir;
  } else if (name === 'idle_bounce_knee') {
    const ease = Math.sin(Math.PI * p);
    const bounce = Math.abs(Math.sin(Math.PI * 5.2 * p)) * ease * intensity;
    const mainUpperLeg = dir > 0 ? lUpperLeg : rUpperLeg;
    const mainLowerLeg = dir > 0 ? lLowerLeg : rLowerLeg;
    const baseUL = dir > 0 ? baseLULeg : baseRULeg;
    const baseLL = dir > 0 ? baseLLLeg : baseRLLeg;
    if (mainUpperLeg && baseUL) mainUpperLeg.rotation.x = baseUL.x - 0.1 * bounce;
    if (mainLowerLeg && baseLL) mainLowerLeg.rotation.x = baseLL.x + 0.16 * bounce;
    if (hips && baseHips)
      hips.rotation.y = baseHips.y + 0.04 * Math.sin(Math.PI * 1.2 * p) * ease * intensity;
    if (spine && baseSpine)
      spine.rotation.z = baseSpine.z + 0.02 * Math.sin(Math.PI * 1.2 * p) * ease * intensity;
  }
};

const handleMotionCommand = (cmd: string | undefined) => {
  const raw = (cmd || '').toLowerCase().trim();
  if (!raw) return;
  lastMotionCommandAt = Date.now();
  idleState.nextAt = 0;
  if (raw === 'mood_happy') {
    startProceduralMotion('happy');
    return;
  }
  if (raw === 'mood_angry') {
    startProceduralMotion('mood_angry');
    return;
  }
  if (raw === 'mood_sleepy') {
    startProceduralMotion('idle_yawn');
    return;
  }
  if (raw === 'mood_tired') {
    startProceduralMotion('idle_squat_think');
    return;
  }
  if (raw === 'mood_confused') {
    startProceduralMotion('idle_think');
    return;
  }
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
  if (raw === 'flick_head') {
    if (props.isHeadHit) {
      startProceduralMotion('head_hit');
      return;
    }
    startProceduralMotion('flick_head');
    return;
  }
  if (raw === 'tap_body' || raw === 'shake') {
    startProceduralMotion(raw);
    return;
  }
  if (raw === 'tilt_left' || raw === 'tilt_right') {
    startProceduralMotion(raw);
    return;
  }
  if (raw === 'happy' || raw === 'friend' || raw === 'activity') {
    startProceduralMotion(raw);
    return;
  }
  if (raw === 'point_left' || raw === 'point_right') {
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
  const allowMouseControl = !!props.mouseControlEnabled;
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

  const desiredYaw = allowMouseControl ? mouseControl.targetYaw : 0;
  const desiredPitch = allowMouseControl ? mouseControl.targetPitch : 0;
  const s = mouseControl.dragging ? 0.22 : allowMouseControl ? 0.14 : 0.08;
  mouseControl.yaw = THREE.MathUtils.lerp(mouseControl.yaw, desiredYaw, s);
  mouseControl.pitch = THREE.MathUtils.lerp(mouseControl.pitch, desiredPitch, s);
  targetRotY += mouseControl.yaw;
  targetRotX += mouseControl.pitch;

  if (hovered && !mouseControl.dragging) {
    const f = allowMouseControl ? 1 : 0.25;
    targetRotZ += pointer.x * 0.06 * f;
    targetRotX += pointer.y * 0.06 * f;
    targetPosX += pointer.x * 0.02 * f;
  }

  const isCalm =
    !talking &&
    !moving &&
    !dizzy &&
    !happy &&
    !angry &&
    !confused &&
    !pouting &&
    !headHit &&
    !crying &&
    !tired &&
    !fainted;
  if (isCalm) {
    targetPosY += Math.sin(t * 1.65 + 0.5) * 0.0035;
    targetRotZ += Math.sin(t * 1.05 + 1.2) * 0.02;
    targetRotY += Math.sin(t * 0.85 + 0.2) * 0.035;
    targetPosX += Math.sin(t * 0.75 + 2.3) * 0.006;
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

  const lShoulder = getBone('leftShoulder') as THREE.Object3D | null;
  const rShoulder = getBone('rightShoulder') as THREE.Object3D | null;
  const lUpperArm = getBone('leftUpperArm') as THREE.Object3D | null;
  const rUpperArm = getBone('rightUpperArm') as THREE.Object3D | null;
  const lLowerArm = getBone('leftLowerArm') as THREE.Object3D | null;
  const rLowerArm = getBone('rightLowerArm') as THREE.Object3D | null;
  const lHand = getBone('leftHand') as THREE.Object3D | null;
  const rHand = getBone('rightHand') as THREE.Object3D | null;
  const spine = getBone('spine') as THREE.Object3D | null;
  const chest = (getBone('chest') || getBone('upperChest')) as THREE.Object3D | null;
  const hips = getBone('hips') as THREE.Object3D | null;

  if (spine) spine.rotation.x = -0.025;
  if (chest) chest.rotation.x = -0.01;
  if (hips) hips.rotation.x = 0.018;

  if (lShoulder) {
    lShoulder.rotation.z = 0.07;
    lShoulder.rotation.x = -0.028;
  }
  if (rShoulder) {
    rShoulder.rotation.z = -0.07;
    rShoulder.rotation.x = -0.028;
  }

  if (lUpperArm) {
    lUpperArm.rotation.z = 1.05;
    lUpperArm.rotation.x = -0.14;
    lUpperArm.rotation.y = 0.09;
  }
  if (rUpperArm) {
    rUpperArm.rotation.z = -1.05;
    rUpperArm.rotation.x = -0.14;
    rUpperArm.rotation.y = -0.09;
  }
  if (lLowerArm) {
    lLowerArm.rotation.z = 0.22;
    lLowerArm.rotation.x = 0.03;
  }
  if (rLowerArm) {
    rLowerArm.rotation.z = -0.22;
    rLowerArm.rotation.x = 0.03;
  }
  if (lHand) {
    lHand.rotation.z = 0.07;
    lHand.rotation.x = 0.035;
  }
  if (rHand) {
    rHand.rotation.z = -0.07;
    rHand.rotation.x = 0.035;
  }
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

  const shouldDriveHead =
    !proceduralMotion &&
    !(activeAction && typeof activeAction.isRunning === 'function' && activeAction.isRunning());

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

  const headFactor = props.mouseControlEnabled ? 1 : 0.2;
  const headYaw = THREE.MathUtils.clamp(tx * 0.38 * headFactor, -0.42, 0.42);
  const headPitch = THREE.MathUtils.clamp(
    (ty * 0.16 + Math.sin(t * 0.7) * 0.015) * headFactor,
    -0.2,
    0.2
  );

  const neckYaw = headYaw * 0.55;
  const neckPitch = headPitch * 0.55;

  const eyeYaw = THREE.MathUtils.clamp(tx * 0.22, -0.28, 0.28);
  const eyePitch = THREE.MathUtils.clamp(ty * 0.12, -0.18, 0.18);

  const k = 0.09;
  const headBase = lookNodes.base.head || { x: 0, y: 0, z: 0 };
  const neckBase = lookNodes.base.neck || { x: 0, y: 0, z: 0 };
  const leftEyeBase = lookNodes.base.leftEye || { x: 0, y: 0, z: 0 };
  const rightEyeBase = lookNodes.base.rightEye || { x: 0, y: 0, z: 0 };
  lookState.leftEyeTargetY = leftEyeBase.y + eyeYaw;
  lookState.leftEyeTargetX = leftEyeBase.x + eyePitch;
  lookState.rightEyeTargetY = rightEyeBase.y + eyeYaw;
  lookState.rightEyeTargetX = rightEyeBase.x + eyePitch;

  if (shouldDriveHead && lookNodes.head) {
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

  if (shouldDriveHead && lookNodes.neck) {
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
      lookState.leftEyeTargetY,
      k * 1.35
    );
    lookNodes.leftEye.rotation.x = THREE.MathUtils.lerp(
      lookNodes.leftEye.rotation.x,
      lookState.leftEyeTargetX,
      k * 1.35
    );
  }

  if (lookNodes.rightEye) {
    lookNodes.rightEye.rotation.y = THREE.MathUtils.lerp(
      lookNodes.rightEye.rotation.y,
      lookState.rightEyeTargetY,
      k * 1.35
    );
    lookNodes.rightEye.rotation.x = THREE.MathUtils.lerp(
      lookNodes.rightEye.rotation.x,
      lookState.rightEyeTargetX,
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

watch(
  () => props.isHeadHit,
  (v, prev) => {
    if (!v || prev) return;
    lastMotionCommandAt = Date.now();
    idleState.nextAt = 0;
    startProceduralMotion('head_hit');
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

<template>
  <div class="vrm-widget" ref="containerRef">
    <canvas class="vrm-canvas" ref="canvasRef"></canvas>
    <div v-if="loading" class="vrm-loading">{{ loadingText }}</div>
    <div v-else-if="error" class="vrm-error">{{ error }}</div>
  </div>
</template>

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
