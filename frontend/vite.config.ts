import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { loginSmtpPlugin } from './src/login/server/viteSmtpPlugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), loginSmtpPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
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
          gsap: ['gsap']
        }
      }
    }
  }
});
