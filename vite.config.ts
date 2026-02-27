import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      // For OnSpace preview - detect and use the preview domain
      protocol: 'wss',
      // OnSpace preview domains follow pattern: *.onspace.meme or *.preview.onspace.ai
      // Let the client determine the host automatically
      clientPort: 443,
      overlay: true,
      // Don't specify host - let browser use current domain
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["martin-logo.png", "favicon.ico"],
      manifest: {
        short_name: "Martin OS",
        name: "Martin Builder Operations OS",
        description: "Martin Builder Operations OS",
        start_url: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#4179bc",
        icons: [
          {
            src: "/martin-logo.png?v=3",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/martin-logo.png?v=3",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB (main chunk exceeds 2 MiB default)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]*\/(api|rest|supabase|functions)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 32, maxAgeSeconds: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Generate sourcemaps for production debugging
    sourcemap: true,
    // Optimize chunk size
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
