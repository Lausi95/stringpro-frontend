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
      // PNG icon set (192/512/maskable/apple-touch) generated from the existing
      // favicon. TODO: swap the source SVG for a clay-palette mark — favicon.svg
      // is currently purple and off-brand (docs/adr/0011, docs/adr/0012).
      pwaAssets: {
        image: 'public/favicon.svg',
        preset: 'minimal-2023',
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
