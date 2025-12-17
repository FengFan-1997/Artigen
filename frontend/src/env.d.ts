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
