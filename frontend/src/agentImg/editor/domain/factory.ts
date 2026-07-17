import {
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  type EditorArtboard,
  type EditorDocumentV2,
  type EditorLayer,
  type EllipseEditorLayer,
  type ImageAdjustments,
  type ImageEditorLayer,
  type LayerTransform,
  type LineEditorLayer,
  type NormalizedCrop,
  type RectEditorLayer,
  type TextEditorLayer
} from './types';

const DEFAULT_ARTBOARD: EditorArtboard = {
  width: 1200,
  height: 1200,
  colorSpace: 'srgb',
  background: { type: 'color', color: '#ffffff' }
};

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0
};

export const FULL_CROP: NormalizedCrop = { x: 0, y: 0, width: 1, height: 1 };

export function createEditorId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

export function cloneDocument(document: EditorDocumentV2): EditorDocumentV2 {
  // Pinia exposes this JSON-only domain model as a reactive Proxy. Native
  // structuredClone rejects Proxy objects in browsers. JSON cloning also
  // prevents Fabric/runtime instances from entering history or autosave.
  return JSON.parse(JSON.stringify(document)) as EditorDocumentV2;
}

export function createDefaultTransform(x: number, y: number): LayerTransform {
  return {
    x,
    y,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1
  };
}

export function createEditorDocument(
  input: Partial<Pick<EditorDocumentV2, 'projectId' | 'title' | 'artboard'>> = {}
): EditorDocumentV2 {
  const now = new Date().toISOString();
  return {
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    projectId: input.projectId ?? createEditorId('project'),
    title: input.title?.trim() || '未命名设计',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    artboard: normalizeArtboard(input.artboard ?? DEFAULT_ARTBOARD),
    layerOrder: [],
    layers: {}
  };
}

export function createImageLayer(input: {
  assetId: string;
  sourceAssetId?: string;
  naturalWidth: number;
  naturalHeight: number;
  name?: string;
  artboard: EditorArtboard;
}): ImageEditorLayer {
  const maxWidth = input.artboard.width * 0.8;
  const maxHeight = input.artboard.height * 0.8;
  const fitScale = Math.min(1, maxWidth / input.naturalWidth, maxHeight / input.naturalHeight);
  return {
    id: createEditorId('layer'),
    type: 'image',
    name: input.name?.trim() || '图片',
    visible: true,
    locked: false,
    assetId: input.assetId,
    sourceAssetId: input.sourceAssetId ?? input.assetId,
    naturalWidth: positiveInt(input.naturalWidth, 1),
    naturalHeight: positiveInt(input.naturalHeight, 1),
    crop: { ...FULL_CROP },
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    transform: {
      ...createDefaultTransform(input.artboard.width / 2, input.artboard.height / 2),
      scaleX: fitScale,
      scaleY: fitScale
    }
  };
}

export function createTextLayer(artboard: EditorArtboard, text = '双击编辑文字'): TextEditorLayer {
  return {
    id: createEditorId('layer'),
    type: 'text',
    name: '文字',
    visible: true,
    locked: false,
    text,
    width: Math.min(480, artboard.width * 0.7),
    fontFamily: 'Inter, "PingFang SC", sans-serif',
    fontSize: Math.max(24, Math.round(artboard.width / 20)),
    fontWeight: 700,
    lineHeight: 1.2,
    textAlign: 'center',
    fill: '#0B0D0E',
    transform: createDefaultTransform(artboard.width / 2, artboard.height / 2)
  };
}

export function createRectLayer(artboard: EditorArtboard): RectEditorLayer {
  return {
    id: createEditorId('layer'),
    type: 'rect',
    name: '圆角矩形',
    visible: true,
    locked: false,
    width: Math.min(360, artboard.width * 0.5),
    height: Math.min(240, artboard.height * 0.35),
    radius: 28,
    fill: '#C8FF3D',
    stroke: '#0B0D0E',
    strokeWidth: 0,
    transform: createDefaultTransform(artboard.width / 2, artboard.height / 2)
  };
}

export function createEllipseLayer(artboard: EditorArtboard): EllipseEditorLayer {
  return {
    id: createEditorId('layer'),
    type: 'ellipse',
    name: '椭圆',
    visible: true,
    locked: false,
    width: Math.min(300, artboard.width * 0.42),
    height: Math.min(300, artboard.height * 0.42),
    fill: '#C8FF3D',
    stroke: '#0B0D0E',
    strokeWidth: 0,
    transform: createDefaultTransform(artboard.width / 2, artboard.height / 2)
  };
}

export function createLineLayer(artboard: EditorArtboard): LineEditorLayer {
  return {
    id: createEditorId('layer'),
    type: 'line',
    name: '直线',
    visible: true,
    locked: false,
    width: Math.min(360, artboard.width * 0.5),
    stroke: '#0B0D0E',
    strokeWidth: 8,
    transform: createDefaultTransform(artboard.width / 2, artboard.height / 2)
  };
}

export function addLayer(document: EditorDocumentV2, layer: EditorLayer): EditorDocumentV2 {
  return updateDocument(document, (draft) => {
    draft.layers[layer.id] = layer;
    draft.layerOrder.push(layer.id);
  });
}

export function updateDocument(
  document: EditorDocumentV2,
  mutate: (draft: EditorDocumentV2) => void
): EditorDocumentV2 {
  const draft = cloneDocument(document);
  mutate(draft);
  draft.revision = Math.max(0, document.revision) + 1;
  draft.updatedAt = new Date().toISOString();
  return normalizeDocument(draft);
}

export function normalizeDocument(input: EditorDocumentV2): EditorDocumentV2 {
  const document = cloneDocument(input);
  document.schemaVersion = EDITOR_DOCUMENT_SCHEMA_VERSION;
  document.projectId = document.projectId || createEditorId('project');
  document.title = document.title?.trim() || '未命名设计';
  document.artboard = normalizeArtboard(document.artboard);
  document.layers = document.layers ?? {};

  const seen = new Set<string>();
  document.layerOrder = (document.layerOrder ?? []).filter((id) => {
    if (!document.layers[id] || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of Object.keys(document.layers)) {
    if (!seen.has(id)) document.layerOrder.push(id);
  }
  for (const layer of Object.values(document.layers)) normalizeLayer(layer, document.artboard);
  return document;
}

function normalizeArtboard(artboard: EditorArtboard): EditorArtboard {
  const background = artboard?.background?.type === 'transparent'
    ? { type: 'transparent' as const }
    : { type: 'color' as const, color: safeColor(artboard?.background?.color, '#ffffff') };
  return {
    width: clamp(positiveInt(artboard?.width, DEFAULT_ARTBOARD.width), 1, 16384),
    height: clamp(positiveInt(artboard?.height, DEFAULT_ARTBOARD.height), 1, 16384),
    colorSpace: 'srgb',
    background
  };
}

function normalizeLayer(layer: EditorLayer, artboard: EditorArtboard): void {
  layer.name = layer.name?.trim() || layer.type;
  layer.visible = layer.visible !== false;
  layer.locked = layer.locked === true;
  layer.transform = layer.transform ?? createDefaultTransform(artboard.width / 2, artboard.height / 2);
  layer.transform.x = finite(layer.transform.x, artboard.width / 2);
  layer.transform.y = finite(layer.transform.y, artboard.height / 2);
  layer.transform.scaleX = clamp(Math.abs(finite(layer.transform.scaleX, 1)), 0.001, 100);
  layer.transform.scaleY = clamp(Math.abs(finite(layer.transform.scaleY, 1)), 0.001, 100);
  layer.transform.rotation = finite(layer.transform.rotation, 0);
  layer.transform.opacity = clamp(finite(layer.transform.opacity, 1), 0, 1);
  layer.transform.flipX = layer.transform.flipX === true;
  layer.transform.flipY = layer.transform.flipY === true;
  if (layer.type === 'image') {
    layer.naturalWidth = positiveInt(layer.naturalWidth, 1);
    layer.naturalHeight = positiveInt(layer.naturalHeight, 1);
    layer.crop = normalizeCrop(layer.crop);
    layer.adjustments = normalizeAdjustments(layer.adjustments);
  }
}

function normalizeCrop(crop: NormalizedCrop | undefined): NormalizedCrop {
  const x = clamp(finite(crop?.x, 0), 0, 0.999);
  const y = clamp(finite(crop?.y, 0), 0, 0.999);
  return {
    x,
    y,
    width: clamp(finite(crop?.width, 1), 0.001, 1 - x),
    height: clamp(finite(crop?.height, 1), 0.001, 1 - y)
  };
}

function normalizeAdjustments(value: ImageAdjustments | undefined): ImageAdjustments {
  return {
    brightness: clamp(finite(value?.brightness, 0), -1, 1),
    contrast: clamp(finite(value?.contrast, 0), -1, 1),
    saturation: clamp(finite(value?.saturation, 0), -1, 1),
    hue: clamp(finite(value?.hue, 0), -180, 180),
    blur: clamp(finite(value?.blur, 0), 0, 40),
    grayscale: clamp(finite(value?.grayscale, 0), 0, 1),
    sepia: clamp(finite(value?.sepia, 0), 0, 1)
  };
}

function positiveInt(value: number | undefined, fallback: number): number {
  const normalized = Math.round(finite(value, fallback));
  return normalized > 0 ? normalized : fallback;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeColor(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
