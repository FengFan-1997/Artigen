import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    // gifenc is imported only from a Worker, so Vite's normal source scan does
    // not discover it. Pre-bundle it up front to avoid a cold-start page reload
    // while a local video conversion is already running.
    include: ['gifenc']
  },
  server: {
    port: 4000,
    fs: {
      allow: [resolve(__dirname, '..')]
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: 180000,
        proxyTimeout: 180000
      },
      '/files': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: 180000,
        proxyTimeout: 180000
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          antd: ['ant-design-vue', '@ant-design/icons-vue'],
          echarts: ['echarts', 'vue-echarts'],
          pdf: ['pdfjs-dist'],
          fabric: ['fabric'],
          gsap: ['gsap']
        }
      }
    }
  },
  worker: {
    // Codec workers lazy-load jSquash WASM, which requires an ES module worker
    // bundle so Rollup can preserve worker-local code splitting.
    format: 'es'
  }
});
