/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: 'dev' | 'development' | 'production';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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

declare module '@novnc/novnc/lib/rfb' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: Record<string, unknown>);
    scaleViewport: boolean;
    resizeSession: boolean;
    viewOnly: boolean;
    disconnect(): void;
    focus(): void;
  }
}
