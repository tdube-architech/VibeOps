import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

function buildTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // UTC mmddhhmm so timestamps line up across machines / CI
  return `${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

const BUILD_TIMESTAMP = process.env.VIBEOPS_BUILD_TIMESTAMP ?? buildTimestamp();

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __BUILD_TIMESTAMP__: JSON.stringify(BUILD_TIMESTAMP)
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main')
      }
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: '.',
    plugins: [react()],
    define: {
      __BUILD_TIMESTAMP__: JSON.stringify(BUILD_TIMESTAMP)
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@': resolve(__dirname, 'src/renderer')
      }
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    },
    server: { port: 5173 }
  }
});
