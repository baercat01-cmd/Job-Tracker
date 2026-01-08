import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      // Auto-detect OnSpace domains and configure WebSocket accordingly
      clientPort: typeof process.env.VITE_HMR_CLIENT_PORT !== 'undefined' 
        ? parseInt(process.env.VITE_HMR_CLIENT_PORT) 
        : 443, // Use standard HTTPS port for OnSpace domains
      protocol: typeof process.env.VITE_HMR_PROTOCOL !== 'undefined'
        ? process.env.VITE_HMR_PROTOCOL as 'ws' | 'wss'
        : 'wss', // Use secure WebSocket for OnSpace domains
      host: typeof process.env.VITE_HMR_HOST !== 'undefined'
        ? process.env.VITE_HMR_HOST
        : undefined, // Will auto-detect from window.location
      overlay: true,
    },
  },
  plugins: [
    react(),
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
