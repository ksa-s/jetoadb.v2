import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // ── تشفير وتصغير الكود المنشور ──
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false,   // نبقي console للـ debugging
          drop_debugger: true,
          passes: 2,
        },
        mangle: {
          toplevel: true,        // تشويش أسماء المتغيرات العامة
        },
        format: {
          comments: false,       // إزالة جميع التعليقات
        },
      },
      // إخفاء مصدر الكود
      sourcemap: false,
      // دمج كل شيء في ملف واحد (أصعب للقراءة)
      rollupOptions: {
        output: {
          // اسم عشوائي للملفات
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash].[ext]',
          // دمج كل المكتبات في bundle واحد
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
