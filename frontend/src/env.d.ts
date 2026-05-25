/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'gifenc' {
  export const GIFEncoder: any;
  export const applyPalette: any;
  export const quantize: any;
}
