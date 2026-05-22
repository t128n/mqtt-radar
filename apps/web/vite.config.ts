import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: {
      '~': path.resolve('./src'),
      '~~': path.resolve('.'),
    },
  },
});
