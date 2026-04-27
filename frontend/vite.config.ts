import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {host:'0.0.0.0'},
  resolve: {
    alias: {
      // Alias Node's internal buffer to the npm package
      buffer: 'buffer/',
    }
  },
  define: {
    // Provide a global window reference for Sabaki
    global: 'globalThis',
  }
});
