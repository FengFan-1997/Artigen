import { cloneDocument } from '../domain/factory';
import type {
  EditorArtboard,
  EditorDocumentV2,
  EditorLayer,
  LayerTransform
} from '../domain/types';

export interface RenderNode {
  layerId: string;
  layer: EditorLayer;
  visible: boolean;
  locked: boolean;
  transform: LayerTransform;
  localWidth: number;
  localHeight: number;
}

export interface RenderDescription {
  projectId: string;
  revision: number;
  artboard: EditorArtboard;
  nodes: RenderNode[];
}

export interface RenderBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createRenderDescription(document: EditorDocumentV2): RenderDescription {
  return {
    projectId: document.projectId,
    revision: document.revision,
    artboard: structuredCloneArtboard(document.artboard),
    nodes: document.layerOrder
      .map((layerId) => document.layers[layerId])
      .filter((layer): layer is EditorLayer => Boolean(layer))
      .map((sourceLayer) => {
        const layer = cloneLayer(sourceLayer);
        const { width, height } = layerLocalSize(layer);
        return {
          layerId: layer.id,
          layer,
          visible: layer.visible,
          locked: layer.locked,
          transform: { ...layer.transform },
          localWidth: width,
          localHeight: height
        };
      })
  };
}

export function getArtboardBounds(description: RenderDescription): RenderBounds {
  return { x: 0, y: 0, width: description.artboard.width, height: description.artboard.height };
}

export function getContentBounds(description: RenderDescription): RenderBounds {
  const visibleNodes = description.nodes.filter((node) => node.visible);
  if (!visibleNodes.length) return getArtboardBounds(description);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of visibleNodes) {
    const bounds = transformedNodeBounds(node);
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.max(1, Math.ceil(maxX) - Math.floor(minX)),
    height: Math.max(1, Math.ceil(maxY) - Math.floor(minY))
  };
}

export function layerLocalSize(layer: EditorLayer): { width: number; height: number } {
  if (layer.type === 'image') {
    return {
      width: layer.naturalWidth * layer.crop.width,
      height: layer.naturalHeight * layer.crop.height
    };
  }
  if (layer.type === 'text') {
    const lineCount = Math.max(1, layer.text.split('\n').length);
    return { width: layer.width, height: layer.fontSize * layer.lineHeight * lineCount };
  }
  if (layer.type === 'line') return { width: layer.width, height: Math.max(1, layer.strokeWidth) };
  return { width: layer.width, height: layer.height };
}

function transformedNodeBounds(node: RenderNode): RenderBounds {
  const width = node.localWidth * node.transform.scaleX;
  const height = node.localHeight * node.transform.scaleY;
  const radians = (node.transform.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const rotatedWidth = width * cos + height * sin;
  const rotatedHeight = width * sin + height * cos;
  return {
    x: node.transform.x - rotatedWidth / 2,
    y: node.transform.y - rotatedHeight / 2,
    width: rotatedWidth,
    height: rotatedHeight
  };
}

function cloneLayer(layer: EditorLayer): EditorLayer {
  const document = {
    schemaVersion: 2,
    projectId: 'clone',
    title: 'clone',
    revision: 0,
    createdAt: '',
    updatedAt: '',
    artboard: { width: 1, height: 1, colorSpace: 'srgb', background: { type: 'transparent' } },
    layerOrder: [layer.id],
    layers: { [layer.id]: layer }
  } as EditorDocumentV2;
  return cloneDocument(document).layers[layer.id];
}

function structuredCloneArtboard(artboard: EditorArtboard): EditorArtboard {
  return {
    width: artboard.width,
    height: artboard.height,
    colorSpace: 'srgb',
    background: artboard.background.type === 'transparent'
      ? { type: 'transparent' }
      : { type: 'color', color: artboard.background.color }
  };
}
