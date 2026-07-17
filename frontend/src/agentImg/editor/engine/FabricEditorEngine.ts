import {
  ActiveSelection,
  Canvas,
  Ellipse,
  FabricImage,
  FabricObject,
  Line,
  Rect,
  Textbox,
  filters,
  util
} from 'fabric';
import type { EditorLayer, LayerTransform } from '../domain/types';
import { createRenderDescription, type RenderNode } from '../export/renderDescription';
import type { EditorDocumentV2 } from '../domain/types';
import {
  adjustmentBlurPixels,
  createAdjustmentColorMatrix,
  isIdentityColorMatrix
} from '../rendering/imageAdjustments';
import { boundsFromRect, snapBoundsToGuides } from '../domain/layout';

export interface FabricEditorCallbacks {
  onSelectionChange?: (layerIds: string[]) => void;
  onTransform?: (layerId: string, transform: LayerTransform) => void;
}

export class FabricEditorEngine {
  readonly canvas: Canvas;
  private callbacks: FabricEditorCallbacks;
  private projectionVersion = 0;
  private projecting = false;
  private artboardWidth = 1;
  private artboardHeight = 1;
  private viewportScale = 1;
  private selectedLayerIds: string[] = [];

  constructor(element: HTMLCanvasElement, callbacks: FabricEditorCallbacks = {}) {
    this.callbacks = callbacks;
    this.canvas = new Canvas(element, {
      preserveObjectStacking: true,
      selection: true,
      uniformScaling: false,
      fireRightClick: false,
      stopContextMenu: true
    });
    this.canvas.on('selection:created', (event) => this.handleSelection(event.selected ?? []));
    this.canvas.on('selection:updated', (event) => this.handleSelection(event.selected ?? []));
    this.canvas.on('selection:cleared', () => this.handleSelection([]));
    this.canvas.on('object:modified', (event) => this.handleObjectModified(event.target));
    this.canvas.on('object:moving', (event) => this.handleObjectMoving(event.target));
    this.canvas.on('text:changed', (event) => this.handleObjectModified(event.target));
  }

  async project(
    document: EditorDocumentV2,
    resolveAssetUrl: (assetId: string) => Promise<string>
  ): Promise<void> {
    const version = ++this.projectionVersion;
    const description = createRenderDescription(document);
    this.projecting = true;
    this.artboardWidth = description.artboard.width;
    this.artboardHeight = description.artboard.height;
    this.canvas.discardActiveObject();
    this.canvas.clear();
    this.canvas.setDimensions({ width: this.artboardWidth, height: this.artboardHeight });
    this.canvas.backgroundColor = description.artboard.background.type === 'color'
      ? description.artboard.background.color
      : 'rgba(0,0,0,0)';

    try {
      const projected = await Promise.all(
        description.nodes.map((node) => this.createObject(node, resolveAssetUrl))
      );
      if (version !== this.projectionVersion) {
        projected.forEach((object) => object?.dispose?.());
        return;
      }
      for (const object of projected) {
        if (object) this.canvas.add(object);
      }
    } finally {
      if (version === this.projectionVersion) this.projecting = false;
    }
    if (version !== this.projectionVersion) return;
    this.restoreSelection();
    this.canvas.requestRenderAll();
  }

  setSelection(layerIds: string[]): void {
    const next = [...new Set(layerIds)];
    if (
      next.length === this.selectedLayerIds.length &&
      next.every((layerId, index) => layerId === this.selectedLayerIds[index])
    ) return;
    this.selectedLayerIds = next;
    this.restoreSelection();
  }

  fitToViewport(width: number, height: number, padding = 56): number {
    const availableWidth = Math.max(1, width - padding * 2);
    const availableHeight = Math.max(1, height - padding * 2);
    const scale = Math.min(1, availableWidth / this.artboardWidth, availableHeight / this.artboardHeight);
    this.viewportScale = scale;
    this.canvas.setDimensions(
      { width: Math.round(this.artboardWidth * scale), height: Math.round(this.artboardHeight * scale) },
      { cssOnly: true }
    );
    this.canvas.calcOffset();
    return scale;
  }

  dispose(): void {
    this.projectionVersion += 1;
    this.canvas.dispose();
  }

  private async createObject(
    node: RenderNode,
    resolveAssetUrl: (assetId: string) => Promise<string>
  ): Promise<FabricObject | null> {
    const layer = node.layer;
    let object: FabricObject;
    if (layer.type === 'image') {
      const url = await resolveAssetUrl(layer.assetId);
      const image = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
      image.set({
        cropX: layer.crop.x * layer.naturalWidth,
        cropY: layer.crop.y * layer.naturalHeight,
        width: layer.crop.width * layer.naturalWidth,
        height: layer.crop.height * layer.naturalHeight
      });
      image.filters = imageFilters(layer);
      if (image.filters.length) image.applyFilters();
      object = image;
    } else if (layer.type === 'text') {
      object = new Textbox(layer.text, {
        width: layer.width,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontWeight: layer.fontWeight,
        lineHeight: layer.lineHeight,
        textAlign: layer.textAlign,
        fill: layer.fill,
        editable: !layer.locked
      });
    } else if (layer.type === 'rect') {
      object = new Rect({
        width: layer.width,
        height: layer.height,
        rx: layer.radius,
        ry: layer.radius,
        fill: layer.fill,
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth
      });
    } else if (layer.type === 'ellipse') {
      object = new Ellipse({
        rx: layer.width / 2,
        ry: layer.height / 2,
        fill: layer.fill,
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth
      });
    } else {
      object = new Line([-layer.width / 2, 0, layer.width / 2, 0], {
        stroke: layer.stroke,
        strokeWidth: layer.strokeWidth,
        strokeLineCap: 'round'
      });
    }
    object.set({
      layerId: layer.id,
      originX: 'center',
      originY: 'center',
      left: node.transform.x,
      top: node.transform.y,
      scaleX: node.transform.scaleX,
      scaleY: node.transform.scaleY,
      angle: node.transform.rotation,
      flipX: node.transform.flipX,
      flipY: node.transform.flipY,
      opacity: node.transform.opacity,
      visible: node.visible,
      selectable: !node.locked,
      evented: !node.locked,
      lockMovementX: node.locked,
      lockMovementY: node.locked,
      lockRotation: node.locked,
      lockScalingX: node.locked,
      lockScalingY: node.locked,
      borderColor: '#C8FF3D',
      cornerColor: '#0B0D0E',
      cornerStrokeColor: '#C8FF3D',
      cornerSize: 13,
      transparentCorners: false,
      padding: 2
    });
    return object;
  }

  private restoreSelection(): void {
    if (this.projecting) return;
    const selected = this.canvas.getObjects().filter((object) =>
      object.layerId && this.selectedLayerIds.includes(object.layerId) && object.selectable
    );
    this.canvas.discardActiveObject();
    if (selected.length === 1) this.canvas.setActiveObject(selected[0]);
    else if (selected.length > 1) {
      this.canvas.setActiveObject(new ActiveSelection(selected, { canvas: this.canvas }));
    }
    this.canvas.requestRenderAll();
  }

  private handleSelection(objects: FabricObject[]): void {
    if (this.projecting) return;
    this.selectedLayerIds = objects
      .map((object) => object.layerId)
      .filter((layerId): layerId is string => Boolean(layerId));
    this.callbacks.onSelectionChange?.([...this.selectedLayerIds]);
  }

  private handleObjectModified(target?: FabricObject): void {
    if (this.projecting || !target) return;
    if (target instanceof ActiveSelection) {
      for (const object of target.getObjects()) this.emitWorldTransform(object);
      return;
    }
    this.emitWorldTransform(target);
  }

  private handleObjectMoving(target?: FabricObject): void {
    if (this.projecting || !target) return;
    const targetBounds = target.getBoundingRect();
    const excluded = new Set<FabricObject>(
      target instanceof ActiveSelection ? target.getObjects() : [target]
    );
    const xGuides = [0, this.artboardWidth / 2, this.artboardWidth];
    const yGuides = [0, this.artboardHeight / 2, this.artboardHeight];
    for (const object of this.canvas.getObjects()) {
      if (excluded.has(object) || !object.visible) continue;
      const bounds = object.getBoundingRect();
      xGuides.push(bounds.left, bounds.left + bounds.width / 2, bounds.left + bounds.width);
      yGuides.push(bounds.top, bounds.top + bounds.height / 2, bounds.top + bounds.height);
    }
    const snapped = snapBoundsToGuides(
      boundsFromRect(targetBounds.left, targetBounds.top, targetBounds.width, targetBounds.height),
      xGuides,
      yGuides,
      8 / Math.max(0.05, this.viewportScale)
    );
    if (!snapped.snappedX && !snapped.snappedY) return;
    target.set({
      left: (target.left ?? 0) + snapped.x,
      top: (target.top ?? 0) + snapped.y
    });
    target.setCoords();
  }

  private emitWorldTransform(object: FabricObject): void {
    if (!object.layerId) return;
    const decomposed = util.qrDecompose(object.calcTransformMatrix());
    this.callbacks.onTransform?.(object.layerId, {
      x: decomposed.translateX,
      y: decomposed.translateY,
      scaleX: Math.max(0.001, Math.abs(decomposed.scaleX)),
      scaleY: Math.max(0.001, Math.abs(decomposed.scaleY)),
      rotation: decomposed.angle,
      flipX: object.flipX,
      flipY: object.flipY,
      opacity: object.opacity
    });
  }
}

function imageFilters(layer: Extract<EditorLayer, { type: 'image' }>): filters.BaseFilter<string>[] {
  const matrix = createAdjustmentColorMatrix(layer.adjustments);
  const result: filters.BaseFilter<string>[] = [];
  if (!isIdentityColorMatrix(matrix)) result.push(new filters.ColorMatrix({ matrix }));
  const blur = adjustmentBlurPixels(layer.adjustments);
  if (blur) result.push(new filters.Blur({ blur: blur / 40 }));
  return result;
}
