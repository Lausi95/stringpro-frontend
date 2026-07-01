import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // New deploys are fetched and applied silently, reloading on activation.
      // See docs/adr/0011-pwa-installable-online-only.md
      registerType: 'autoUpdate',
      // PNG icon set (192/512/maskable/apple-touch/favicon) generated from the
      // brand mark in public/favicon.png (1254×1254 square source). Custom preset
      // mirrors minimal-2023 but pads maskable/apple with the clay-orange brand
      // fill (#c55334, = the mark's background) instead of the generator's white
      // default, so Android adaptive masks and the iOS home-screen tile stay
      // full-bleed on-brand rather than showing white margins.
      pwaAssets: {
        image: 'public/favicon.png',
        preset: {
          transparent: {
            sizes: [64, 192, 512],
            favicons: [[48, 'favicon.ico']],
          },
          maskable: {
            sizes: [512],
            padding: 0.1,
            resizeOptions: { background: '#c55334' },
          },
          apple: {
            sizes: [180],
            padding: 0.05,
            resizeOptions: { background: '#c55334' },
          },
        },
      },
      manifest: {
        name: 'StringPro',
        short_name: 'StringPro',
        description: 'Manage your tennis stringing business — jobs, customers, strings, and payments.',
        // Light clay chrome + splash (= --clay-50, oklch(97% 0.01 42)).
        // Manifests/iOS do not parse oklch(), so this is the converted hex.
        theme_color: '#fbf3f0',
        background_color: '#fbf3f0',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'en',
      },
      workbox: {
        // Online-only: precache the built app shell only. `/api/*` and Keycloak
        // are never cached — generateSW leaves non-navigation requests on the
        // network, and we deny-list /api from the SPA navigation fallback so API
        // calls are never answered with index.html.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Keep the SW out of `pnpm dev`; exercise it via `pnpm build && pnpm preview`.
        enabled: false,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
})
