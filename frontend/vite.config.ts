import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import fs from 'fs';

const vrmBaseDirCandidates = [
  resolve(__dirname, '../doc/model/Genshin'),
  resolve(__dirname, '../doc/model/模型文件'),
  resolve(__dirname, '../doc/model/vrm'),
  resolve(__dirname, '../doc/model')
];

const VRM_BASE_DIR =
  vrmBaseDirCandidates.find((dir) => {
    try {
      return fs.existsSync(dir);
    } catch {
      return false;
    }
  }) || vrmBaseDirCandidates[vrmBaseDirCandidates.length - 1];

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'virtual-vrm-models',
      resolveId(id) {
        if (id === 'virtual:vrm-models') return '\0virtual:vrm-models';
        return null;
      },
      load(id) {
        if (id !== '\0virtual:vrm-models') return null;
        const baseDir = VRM_BASE_DIR;

        const walk = (dir: string, out: string[]) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full, out);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.vrm')) {
              const rel = full
                .slice(baseDir.length + 1)
                .split('\\')
                .join('/');
              out.push(rel);
            }
          }
        };

        const relPaths: string[] = [];
        try {
          if (fs.existsSync(baseDir)) walk(baseDir, relPaths);
        } catch {}

        relPaths.sort((a, b) => a.localeCompare(b));

        return `export const vrmRelativePaths = ${JSON.stringify(relPaths)};`;
      }
    }
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  define: {
    __DEV_VRM_BASE__: JSON.stringify(VRM_BASE_DIR)
  },
  server: {
    port: 4000,
    fs: {
      allow: [resolve(__dirname, '..')]
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
});
