import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});
