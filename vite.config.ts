import { defineConfig } from 'vite';

export default defineConfig(() => {
  // GitHub Actions تضع هذا المتغير تلقائياً عند البناء
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  return {
    // '/jetoadb.v2/' لـ GitHub Pages | '/' لـ Vercel وغيره
    base: isGitHubActions ? '/jetoadb.v2/' : '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_debugger: true,
          passes: 2,
        },
        mangle: {
          toplevel: true,
        },
        format: {
          comments: false,
        },
      },
      sourcemap: false,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash].[ext]',
          manualChunks: undefined,
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});
