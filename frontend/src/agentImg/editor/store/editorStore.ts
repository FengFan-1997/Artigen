import { computed, markRaw, ref } from 'vue';
import { defineStore } from 'pinia';
import { AssetUrlRegistry } from '../assets/AssetUrlRegistry';
import { EditorDatabase } from '../assets/EditorDatabase';
import {
  createEditorDocument,
  createEditorId,
  createEllipseLayer,
  createImageLayer,
  createLineLayer,
  createRectLayer,
  createTextLayer,
  normalizeDocument,
  updateDocument
} from '../domain/factory';
import { collectDocumentAssetIds } from '../domain/reachability';
import type {
  EditorAssetRecord,
  EditorBackground,
  EditorDocumentV2,
  EditorLayer,
  ImageAdjustments,
  LayerTransform,
  NormalizedCrop
} from '../domain/types';
import {
  alignLayerTransforms,
  distributeLayerTransforms,
  type LayerAlignment,
  type LayerDistribution
} from '../domain/layout';
import {
  downloadEditorExport,
  type EditorExportOptions,
  type EditorExportResult
} from '../export/exportRenderer';
import { ExportWorkerClient } from '../export/ExportWorkerClient';
import { CommandHistory } from '../history/CommandHistory';
import {
  ProjectAutosave,
  recoverMostRecentDraft,
  type AutosaveState
} from '../projects/ProjectAutosave';
import { PixelWorkerClient } from '../workers/PixelWorkerClient';
import type {
  NormalizedPixelPoint,
  PixelBuffer,
  PixelOperation
} from '../workers/protocol';

export type EditorAlignment = LayerAlignment;
export type EditorDistribution = LayerDistribution;

export const useImageEditorV2Store = defineStore('imageEditorV2', () => {
  const document = ref<EditorDocumentV2>(createEditorDocument());
  const selectedLayerIds = ref<string[]>([]);
  const initialized = ref(false);
  const recoveredDraft = ref(false);
  const autosaveState = ref<AutosaveState>({ status: 'idle' });
  const storageError = ref<string | null>(null);
  const operationError = ref<string | null>(null);
  const processing = ref<{ layerId: string; label: string } | null>(null);
  const historyVersion = ref(0);

  const database = markRaw(new EditorDatabase());
  const assetUrls = markRaw(new AssetUrlRegistry());
  const history = markRaw(new CommandHistory(100));
  const pixelWorker = markRaw(new PixelWorkerClient());
  const exportWorker = markRaw(new ExportWorkerClient());
  const memoryAssets = markRaw(new Map<string, EditorAssetRecord>());
  let autosave: ProjectAutosave | null = null;
  let processingSequence = 0;
  let runtimeEpoch = 0;

  const orderedLayers = computed(() =>
    document.value.layerOrder
      .map((id) => document.value.layers[id])
      .filter((layer): layer is EditorLayer => Boolean(layer))
  );
  const selectedLayer = computed(() => {
    const id = selectedLayerIds.value[0];
    return id ? document.value.layers[id] ?? null : null;
  });
  const canUndo = computed(() => {
    void historyVersion.value;
    return history.canUndo;
  });
  const canRedo = computed(() => {
    void historyVersion.value;
    return history.canRedo;
  });
  const hasLayers = computed(() => document.value.layerOrder.length > 0);
  const canDeleteSelection = computed(() => selectedLayerIds.value.some((id) => {
    const layer = document.value.layers[id];
    return Boolean(layer && !layer.locked);
  }));

  async function initialize(): Promise<void> {
    runtimeEpoch += 1;
    if (initialized.value) return;
    autosave = markRaw(new ProjectAutosave(
      async (snapshot) => {
        await database.saveProject(snapshot);
      },
      (state) => {
        autosaveState.value = state;
        if (state.status === 'error') storageError.value = friendlyStorageError(state.error);
      },
      750
    ));
    try {
      const latest = await recoverMostRecentDraft(database);
      if (latest) {
        document.value = normalizeDocument(latest);
        recoveredDraft.value = true;
      }
    } catch (error) {
      storageError.value = friendlyStorageError(error);
    }
    initialized.value = true;
  }

  function newProject(): void {
    pixelWorker.invalidateProject(document.value.projectId);
    exportWorker.cancel();
    history.clear();
    historyVersion.value += 1;
    document.value = createEditorDocument();
    selectedLayerIds.value = [];
    recoveredDraft.value = false;
    operationError.value = null;
    scheduleAutosave();
  }

  async function addImage(file: File): Promise<void> {
    operationError.value = null;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('单张图片不能超过 50MB。');
      const detectedMime = await detectSupportedImageMime(file);
      if (!detectedMime) throw new Error('文件内容不是有效的 PNG、JPEG 或 WebP 图片。');
      const normalizedFile = file.type === detectedMime
        ? file
        : new File([file], file.name, { type: detectedMime, lastModified: file.lastModified });
      const dimensions = await readImageDimensions(normalizedFile);
      if (
        dimensions.width > 16_384 ||
        dimensions.height > 16_384 ||
        dimensions.width * dimensions.height > 80_000_000
      ) {
        throw new Error('图片尺寸过大：最长边需不超过 16384px，总像素需不超过 8000 万。');
      }
      const assetId = createEditorId('asset');
      await rememberAsset({
        id: assetId,
        blob: normalizedFile,
        name: file.name,
        width: dimensions.width,
        height: dimensions.height
      });
      const layer = createImageLayer({
        assetId,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        name: file.name,
        artboard: document.value.artboard
      });
      commit('导入图片', (draft) => {
        draft.layers[layer.id] = layer;
        draft.layerOrder.push(layer.id);
      });
      setSelection([layer.id]);
    } catch (error) {
      operationError.value = friendlyOperationError(error);
      throw error;
    }
  }

  function addText(): void {
    const layer = createTextLayer(document.value.artboard);
    addCreatedLayer('添加文字', layer);
  }

  function addRect(): void {
    const layer = createRectLayer(document.value.artboard);
    addCreatedLayer('添加矩形', layer);
  }

  function addEllipse(): void {
    const layer = createEllipseLayer(document.value.artboard);
    addCreatedLayer('添加椭圆', layer);
  }

  function addLine(): void {
    const layer = createLineLayer(document.value.artboard);
    addCreatedLayer('添加直线', layer);
  }

  function addCreatedLayer(label: string, layer: EditorLayer): void {
    commit(label, (draft) => {
      draft.layers[layer.id] = layer;
      draft.layerOrder.push(layer.id);
    });
    setSelection([layer.id]);
  }

  function setSelection(layerIds: string[]): void {
    const valid = [...new Set(layerIds)].filter((id) => Boolean(document.value.layers[id]));
    const next = new Set(valid);
    for (const previousId of selectedLayerIds.value) {
      if (!next.has(previousId)) {
        if (processing.value?.layerId === previousId) {
          processingSequence += 1;
          processing.value = null;
        }
        pixelWorker.invalidateLayer(document.value.projectId, previousId);
      }
    }
    selectedLayerIds.value = valid;
  }

  function updateLayerTransform(layerId: string, transform: LayerTransform): void {
    const current = document.value.layers[layerId];
    if (!current || transformsEqual(current.transform, transform)) return;
    commit('变换图层', (draft) => {
      const layer = draft.layers[layerId];
      if (layer && !layer.locked) layer.transform = { ...transform };
    });
  }

  function patchSelectedLayer(patch: Partial<EditorLayer>, label = '编辑图层'): void {
    const id = selectedLayerIds.value[0];
    if (!id) return;
    commit(label, (draft) => {
      const layer = draft.layers[id];
      if (!layer || layer.locked) return;
      Object.assign(layer, patch);
    });
  }

  function updateText(text: string): void {
    const id = selectedLayerIds.value[0];
    if (!id) return;
    commit('编辑文字', (draft) => {
      const layer = draft.layers[id];
      if (layer?.type === 'text' && !layer.locked) layer.text = text;
    }, `text:${id}`);
  }

  function updateImageAdjustments(patch: Partial<ImageAdjustments>): void {
    const id = selectedLayerIds.value[0];
    if (!id) return;
    commit('调整图片', (draft) => {
      const layer = draft.layers[id];
      if (layer?.type === 'image' && !layer.locked) {
        layer.adjustments = { ...layer.adjustments, ...patch };
      }
    });
  }

  function updateImageCrop(crop: NormalizedCrop): void {
    const id = selectedLayerIds.value[0];
    if (!id) return;
    commit('非破坏裁剪', (draft) => {
      const layer = draft.layers[id];
      if (layer?.type === 'image' && !layer.locked) layer.crop = { ...crop };
    });
  }

  function toggleLayerVisibility(layerId: string): void {
    commit('切换图层可见性', (draft) => {
      const layer = draft.layers[layerId];
      if (layer) layer.visible = !layer.visible;
    });
  }

  function toggleLayerLock(layerId: string): void {
    commit('切换图层锁定', (draft) => {
      const layer = draft.layers[layerId];
      if (layer) layer.locked = !layer.locked;
    });
  }

  function moveLayer(layerId: string, direction: 'up' | 'down' | 'front' | 'back'): void {
    commit('调整图层顺序', (draft) => {
      const index = draft.layerOrder.indexOf(layerId);
      if (index < 0) return;
      const [id] = draft.layerOrder.splice(index, 1);
      if (direction === 'front') draft.layerOrder.push(id);
      else if (direction === 'back') draft.layerOrder.unshift(id);
      else {
        const nextIndex = direction === 'up'
          ? Math.min(draft.layerOrder.length, index + 1)
          : Math.max(0, index - 1);
        draft.layerOrder.splice(nextIndex, 0, id);
      }
    });
  }

  function removeSelectedLayers(): void {
    if (!selectedLayerIds.value.length) return;
    const selected = new Set(selectedLayerIds.value.filter((id) => !document.value.layers[id]?.locked));
    if (!selected.size) return;
    commit('删除图层', (draft) => {
      for (const id of selected) delete draft.layers[id];
      draft.layerOrder = draft.layerOrder.filter((id) => !selected.has(id));
    });
    selectedLayerIds.value = selectedLayerIds.value.filter((id) => Boolean(document.value.layers[id]));
  }

  function flipSelected(axis: 'x' | 'y'): void {
    const ids = new Set(selectedLayerIds.value);
    commit(axis === 'x' ? '水平翻转' : '垂直翻转', (draft) => {
      for (const id of ids) {
        const layer = draft.layers[id];
        if (!layer || layer.locked) continue;
        if (axis === 'x') layer.transform.flipX = !layer.transform.flipX;
        else layer.transform.flipY = !layer.transform.flipY;
      }
    });
  }

  function alignSelected(alignment: EditorAlignment): void {
    const layers = selectedLayerIds.value
      .map((id) => document.value.layers[id])
      .filter((layer): layer is EditorLayer => Boolean(layer) && !layer.locked);
    if (layers.length < 2) return;
    const transforms = alignLayerTransforms(layers, alignment);
    commit('对齐图层', (draft) => {
      for (const [layerId, transform] of Object.entries(transforms)) {
        const layer = draft.layers[layerId];
        if (layer && !layer.locked) layer.transform = transform;
      }
    });
  }

  function distributeSelected(distribution: EditorDistribution): void {
    const layers = selectedLayerIds.value
      .map((id) => document.value.layers[id])
      .filter((layer): layer is EditorLayer => Boolean(layer) && !layer.locked);
    if (layers.length < 3) return;
    const transforms = distributeLayerTransforms(layers, distribution);
    commit('分布图层', (draft) => {
      for (const [layerId, transform] of Object.entries(transforms)) {
        const layer = draft.layers[layerId];
        if (layer && !layer.locked) layer.transform = transform;
      }
    });
  }

  function updateArtboard(input: { width?: number; height?: number; background?: EditorBackground }): void {
    commit('编辑画板', (draft) => {
      if (input.width !== undefined) draft.artboard.width = input.width;
      if (input.height !== undefined) draft.artboard.height = input.height;
      if (input.background) draft.artboard.background = input.background;
    });
  }

  function undo(): void {
    if (!history.canUndo) return;
    const currentRevision = document.value.revision;
    pixelWorker.invalidateProject(document.value.projectId);
    exportWorker.cancel();
    const restored = history.undo(document.value);
    restored.revision = currentRevision + 1;
    restored.updatedAt = new Date().toISOString();
    document.value = normalizeDocument(restored);
    retainValidSelection();
    historyVersion.value += 1;
    scheduleAutosave();
  }

  function redo(): void {
    if (!history.canRedo) return;
    const currentRevision = document.value.revision;
    pixelWorker.invalidateProject(document.value.projectId);
    exportWorker.cancel();
    const restored = history.redo(document.value);
    restored.revision = currentRevision + 1;
    restored.updatedAt = new Date().toISOString();
    document.value = normalizeDocument(restored);
    retainValidSelection();
    historyVersion.value += 1;
    scheduleAutosave();
  }

  async function upscaleSelected(): Promise<void> {
    await processSelectedImage({
      operation: { type: 'upscale', scale: 2 },
      progressLabel: '正在本地 2× 放大',
      historyLabel: '本地 2× 放大',
      filenameSuffix: '2x'
    });
  }

  async function removeSelectedBackground(): Promise<boolean> {
    return processSelectedImage({
      operation: { type: 'remove-background', tolerance: 56, feather: 0.4 },
      progressLabel: '正在本地去背景',
      historyLabel: '本地实验去背景',
      filenameSuffix: 'no-bg'
    });
  }

  async function enhanceSelectedClarity(): Promise<boolean> {
    return processSelectedImage({
      operation: { type: 'clarity', amount: 0.75 },
      progressLabel: '正在本地增强清晰度',
      historyLabel: '本地实验清晰度增强',
      filenameSuffix: 'clarity'
    });
  }

  async function applySelectedPolygonCutout(points: NormalizedPixelPoint[]): Promise<boolean> {
    return processSelectedImage({
      operation: { type: 'polygon-cutout', points },
      progressLabel: '正在应用多边形抠图',
      historyLabel: '手动多边形抠图',
      filenameSuffix: 'cutout'
    });
  }

  async function processSelectedImage(input: {
    operation: PixelOperation;
    progressLabel: string;
    historyLabel: string;
    filenameSuffix: string;
  }): Promise<boolean> {
    const layer = selectedLayer.value;
    if (!layer || layer.type !== 'image' || processing.value) return false;
    const inputRevision = document.value.revision;
    const inputProjectId = document.value.projectId;
    const inputAssetId = layer.assetId;
    const sequence = ++processingSequence;
    const isStillCurrent = () => {
      const current = document.value.layers[layer.id];
      return (
        sequence === processingSequence &&
        document.value.projectId === inputProjectId &&
        document.value.revision === inputRevision &&
        selectedLayerIds.value.includes(layer.id) &&
        current?.type === 'image' &&
        current.assetId === inputAssetId
      );
    };
    operationError.value = null;
    processing.value = { layerId: layer.id, label: input.progressLabel };
    try {
      const blob = await getAssetBlob(inputAssetId);
      if (!blob) throw new Error('原始图片资产已丢失。');
      if (layer.naturalWidth * layer.naturalHeight > 20_000_000) {
        throw new Error('本地实验像素处理暂时支持不超过 2000 万像素的图片。');
      }
      const pixels = await decodeBlobToPixels(blob);
      if (!isStillCurrent()) return false;
      const result = await pixelWorker.run({
        identity: {
          projectId: inputProjectId,
          layerId: layer.id,
          sourceAssetId: inputAssetId,
          revision: inputRevision
        },
        pixels,
        operation: input.operation
      });
      const isCurrent = pixelWorker.gate.isCurrent(
        result,
        document.value.projectId,
        document.value.revision
      );
      pixelWorker.gate.complete(result);
      if (
        !isCurrent ||
        result.type === 'cancelled' ||
        !isStillCurrent()
      ) return false;
      if (result.type === 'failed') throw new Error(result.message);
      const outputBlob = await encodePixels(result.output, 'image/png');
      if (!isStillCurrent()) return false;
      const outputId = createEditorId('asset');
      await rememberAsset({
        id: outputId,
        blob: outputBlob,
        name: `${layer.name}-${input.filenameSuffix}.png`,
        width: result.output.width,
        height: result.output.height
      });
      if (!isStillCurrent()) return false;
      commit(input.historyLabel, (draft) => {
        const current = draft.layers[layer.id];
        if (current?.type !== 'image' || current.assetId !== inputAssetId) return;
        current.assetId = outputId;
        current.naturalWidth = result.output.width;
        current.naturalHeight = result.output.height;
        if (input.operation.type === 'upscale') {
          current.transform.scaleX /= input.operation.scale;
          current.transform.scaleY /= input.operation.scale;
        }
      });
      return true;
    } catch (error) {
      if (!isPixelCancellation(error)) operationError.value = friendlyOperationError(error);
      return false;
    } finally {
      if (sequence === processingSequence) processing.value = null;
    }
  }

  function cancelProcessing(): void {
    const active = processing.value;
    if (!active) return;
    processingSequence += 1;
    pixelWorker.invalidateLayer(document.value.projectId, active.layerId);
    processing.value = null;
  }

  async function exportDesign(options: EditorExportOptions): Promise<EditorExportResult> {
    operationError.value = null;
    try {
      const snapshot = normalizeDocument(document.value);
      const result = await exportWorker.run(snapshot, getAssetBlob, options);
      downloadEditorExport(result);
      return result;
    } catch (error) {
      operationError.value = friendlyOperationError(error);
      throw error;
    }
  }

  function cancelExport(): void {
    exportWorker.cancel();
  }

  async function getAssetUrl(assetId: string): Promise<string> {
    return assetUrls.get(assetId, getAssetBlob);
  }

  async function getAssetBlob(assetId: string): Promise<Blob | null> {
    return memoryAssets.get(assetId)?.blob ?? database.getAssetBlob(assetId);
  }

  async function flushAutosave(): Promise<void> {
    await autosave?.flush();
  }

  async function disposeRuntime(): Promise<void> {
    const disposedEpoch = runtimeEpoch;
    processingSequence += 1;
    processing.value = null;
    pixelWorker.dispose();
    exportWorker.dispose();
    assetUrls.revokeAll();
    const saved = await autosave?.flush() ?? true;
    if (!saved || runtimeEpoch !== disposedEpoch) return;
    autosave?.cancel();
    autosave = null;
    history.clear();
    historyVersion.value += 1;
    selectedLayerIds.value = [];
    memoryAssets.clear();
    try {
      await database.garbageCollectAssets();
    } catch (error) {
      storageError.value = friendlyStorageError(error);
    } finally {
      database.close();
      initialized.value = false;
    }
  }

  function clearError(): void {
    operationError.value = null;
  }

  function reportOperationError(message: string): void {
    operationError.value = String(message || '').trim() || '操作失败，请重试。';
  }

  function commit(
    label: string,
    mutate: (draft: EditorDocumentV2) => void,
    mergeKey?: string
  ): void {
    const before = document.value;
    const after = updateDocument(before, mutate);
    const comparableAfter = normalizeDocument(after);
    comparableAfter.revision = before.revision;
    comparableAfter.updatedAt = before.updatedAt;
    if (JSON.stringify(before) === JSON.stringify(comparableAfter)) return;
    pixelWorker.invalidateProject(before.projectId);
    exportWorker.cancel();
    history.record(label, before, after, { mergeKey });
    historyVersion.value += 1;
    document.value = after;
    assetUrls.retainOnly(collectDocumentAssetIds(after));
    scheduleAutosave();
  }

  function scheduleAutosave(): void {
    autosave?.schedule(document.value);
  }

  function retainValidSelection(): void {
    selectedLayerIds.value = selectedLayerIds.value.filter((id) => Boolean(document.value.layers[id]));
    assetUrls.retainOnly(collectDocumentAssetIds(document.value));
  }

  async function rememberAsset(input: {
    id: string;
    blob: Blob;
    name: string;
    width: number;
    height: number;
  }): Promise<void> {
    const now = new Date().toISOString();
    const record: EditorAssetRecord = {
      ...input,
      mimeType: input.blob.type || 'application/octet-stream',
      size: input.blob.size,
      createdAt: now,
      lastAccessedAt: now
    };
    memoryAssets.set(input.id, record);
    try {
      await database.putAsset(input);
    } catch (error) {
      storageError.value = friendlyStorageError(error);
    }
  }

  return {
    document,
    selectedLayerIds,
    initialized,
    recoveredDraft,
    autosaveState,
    storageError,
    operationError,
    processing,
    orderedLayers,
    selectedLayer,
    canUndo,
    canRedo,
    hasLayers,
    canDeleteSelection,
    initialize,
    newProject,
    addImage,
    addText,
    addRect,
    addEllipse,
    addLine,
    setSelection,
    updateLayerTransform,
    patchSelectedLayer,
    updateText,
    updateImageAdjustments,
    updateImageCrop,
    toggleLayerVisibility,
    toggleLayerLock,
    moveLayer,
    removeSelectedLayers,
    flipSelected,
    alignSelected,
    distributeSelected,
    updateArtboard,
    undo,
    redo,
    upscaleSelected,
    removeSelectedBackground,
    enhanceSelectedClarity,
    applySelectedPolygonCutout,
    cancelProcessing,
    exportDesign,
    cancelExport,
    getAssetUrl,
    getAssetBlob,
    flushAutosave,
    disposeRuntime,
    clearError,
    reportOperationError
  };
});

async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function detectSupportedImageMime(blob: Blob): Promise<'image/png' | 'image/jpeg' | 'image/webp' | null> {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const ascii = String.fromCharCode(...bytes);
  if (bytes.length >= 12 && ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

async function decodeBlobToPixels(blob: Blob): Promise<PixelBuffer> {
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法读取图片像素。');
  context.drawImage(image, 0, 0);
  image.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: pixels.data.buffer };
}

async function encodePixels(pixels: PixelBuffer, mimeType: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法编码处理结果。');
  context.putImageData(
    new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
    0,
    0
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('无法编码处理结果。'));
    }, mimeType);
  });
}

function transformsEqual(left: LayerTransform, right: LayerTransform): boolean {
  return (
    Math.abs(left.x - right.x) < 0.001 &&
    Math.abs(left.y - right.y) < 0.001 &&
    Math.abs(left.scaleX - right.scaleX) < 0.0001 &&
    Math.abs(left.scaleY - right.scaleY) < 0.0001 &&
    Math.abs(left.rotation - right.rotation) < 0.001 &&
    left.flipX === right.flipX &&
    left.flipY === right.flipY &&
    Math.abs(left.opacity - right.opacity) < 0.0001
  );
}

function friendlyStorageError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return '本地存储空间不足，当前改动尚未安全保存。请导出作品或清理浏览器存储。';
  }
  return error instanceof Error
    ? `草稿保存不可用：${error.message}`
    : '草稿保存不可用，当前改动只保留在这个页面中。';
}

function friendlyOperationError(error: unknown): string {
  if (!(error instanceof Error)) return '操作失败，请重试。';
  const messages: Record<string, string> = {
    ASSET_NOT_FOUND: '图片资产已丢失，请重新导入。',
    EXPORT_CONTEXT_UNAVAILABLE: '浏览器无法创建导出画布。',
    EXPORT_ENCODING_FAILED: '图片编码失败，请更换格式重试。',
    EXPORT_FORMAT_UNSUPPORTED: '当前浏览器不支持所选导出格式。',
    POLYGON_REQUIRES_THREE_POINTS: '多边形抠图至少需要三个锚点。'
  };
  return messages[error.message] ?? error.message;
}

function isPixelCancellation(error: unknown): boolean {
  return error instanceof Error && /(?:CANCELLED|DISPOSED|SUPERSEDED)/.test(error.message);
}
