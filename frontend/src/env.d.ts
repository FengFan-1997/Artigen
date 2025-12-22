/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'pixi-live2d-display/cubism4' {
  export const Live2DModel: any;
}

declare module 'pixi.js' {
  export const Application: any;
}

declare const __DEV_VRM_BASE__: string;

declare module 'virtual:vrm-models' {
  export const vrmRelativePaths: string[];
  export const vrmPersonaTextByModelName: Record<string, { zh: string; en: string }>;
}
