import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Matches the GitHub Pages path (https://<user>.github.io/party-games/).
  base: '/party-games/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Long-lived chunks that rarely change: the word packs and React.
        manualChunks(id) {
          const path = id.split('\\').join('/');
          if (path.includes('/src/words/packs/') || path.includes('/src/words/prompts/')) return 'words';
          if (/\/node_modules\/(react|react-dom|scheduler|zustand)\//.test(path)) return 'react';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
