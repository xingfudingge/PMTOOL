import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 1421,
    strictPort: false,
    hot: {
      protocol: 'ws',
    },
  },
  base: './',
  build: {
    outDir: 'dist',  // 改成 dist，而不是 web/dist
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'web/index.html',
      },
    },
  },
  root: '.', // 改成项目根目录
});
