import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [vue()],
    // GitHub Pages 项目页部署在 /<repo>/ 子路径下，用 .env.ghpages 覆盖
    base: env.VITE_BASE || './',
    build: {
      outDir: 'dist',
      target: 'es2020',
      chunkSizeWarningLimit: 900,
    },
    server: {
      port: 5173,
    },
  };
});
