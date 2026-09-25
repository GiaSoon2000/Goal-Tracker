/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      strategies: 'generateSW',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Goal Planner — backward planning',
        short_name: 'Goal Planner',
        description: "Turn a goal and a deadline into milestones, weekly targets and today's tasks.",
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: '#FFFFFF',
        lang: 'en',
        dir: 'ltr',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [],
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/repo/**', 'src/db/**'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
