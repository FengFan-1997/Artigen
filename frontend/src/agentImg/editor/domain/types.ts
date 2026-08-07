export const EDITOR_DOCUMENT_SCHEMA_VERSION = 2 as const;

export type EditorLayerType = 'image' | 'text' | 'rect' | 'ellipse' | 'line';
export type EditorBackground =
  | { type: 'transparent' }
  | { type: 'color'; color: string };

export interface EditorArtboard {
  width: number;
  height: number;
  colorSpace: 'srgb';
  background: EditorBackground;
}

export interface LayerTransform {
  /** Center point in artboard pixels. */
  x: number;
  /** Center point in artboard pixels. */
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  grayscale: number;
  sepia: number;
}

export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseEditorLayer {
  id: string;
  type: EditorLayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  transform: LayerTransform;
}

export interface ImageEditorLayer extends BaseEditorLayer {
  type: 'image';
  assetId: string;
  sourceAssetId: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: NormalizedCrop;
  adjustments: ImageAdjustments;
}

export interface TextEditorLayer extends BaseEditorLayer {
  type: 'text';
  text: string;
  width: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
  fill: string;
}

export interface RectEditorLayer extends BaseEditorLayer {
  type: 'rect';
  width: number;
  height: number;
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface EllipseEditorLayer extends BaseEditorLayer {
  type: 'ellipse';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface LineEditorLayer extends BaseEditorLayer {
  type: 'line';
  width: number;
  stroke: string;
  strokeWidth: number;
}

export type EditorLayer =
  | ImageEditorLayer
  | TextEditorLayer
  | RectEditorLayer
  | EllipseEditorLayer
  | LineEditorLayer;

export interface EditorDocumentV2 {
  schemaVersion: typeof EDITOR_DOCUMENT_SCHEMA_VERSION;
  projectId: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  artboard: EditorArtboard;
  layerOrder: string[];
  layers: Record<string, EditorLayer>;
}

export interface EditorProjectRecord {
  projectId: string;
  document: EditorDocumentV2;
  assetIds: string[];
  savedAt: string;
}

export interface EditorAssetRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  name: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
  lastAccessedAt: string;
}
