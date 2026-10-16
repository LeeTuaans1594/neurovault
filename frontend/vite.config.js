import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-512.png', 'offline.html'],
      manifest: {
        name: 'NeuroVault — AI Learning Platform',
        short_name: 'NeuroVault',
        description: 'AI-powered education platform with spaced repetition, knowledge graphs, and adaptive learning.',
        theme_color: '#0a0a12',
        background_color: '#0a0a12',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icons/icon-72x72.svg', sizes: '72x72', type: 'image/svg+xml' },
          { src: '/icons/icon-96x96.svg', sizes: '96x96', type: 'image/svg+xml' },
          { src: '/icons/icon-128x128.svg', sizes: '128x128', type: 'image/svg+xml' },
          { src: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Dashboard', url: '/dashboard', icons: [{ src: '/icons/icon-96x96.svg', sizes: '96x96' }] },
          { name: 'AI Studio', url: '/ai-studio', icons: [{ src: '/icons/icon-96x96.svg', sizes: '96x96' }] },
          { name: 'Documents', url: '/documents', icons: [{ src: '/icons/icon-96x96.svg', sizes: '96x96' }] },
        ],
      },
      workbox: {
        // Precache all static assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Offline SPA fallback
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/(?!api\/).*/],
        // Runtime caching
        runtimeCaching: [
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // API: GET requests — NetworkFirst with 10s timeout
            urlPattern: ({ request, url }) => url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Images uploaded by users
            urlPattern: /\/uploads\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'uploads-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  // ── Build optimization ──
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split React core into its own chunk (cached across pages)
          'vendor-react': ['react', 'react-dom'],
          // Router in its own chunk
          'vendor-router': ['react-router-dom'],
          // Icons library (large, rarely changes)
          'vendor-icons': ['lucide-react'],
          // State management
          'vendor-state': ['zustand'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
      '/ws/collab': {
        target: 'ws://localhost:5001',
        ws: true,
      },
    },
  },
})
