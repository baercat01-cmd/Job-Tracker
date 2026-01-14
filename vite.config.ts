import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      // For OnSpace preview - use the current domain instead of localhost
      protocol: 'wss',
      host: typeof process.env.VITE_HMR_HOST !== 'undefined' && process.env.VITE_HMR_HOST !== ''
        ? process.env.VITE_HMR_HOST
        : undefined, // undefined = auto-detect from window.location.host
      clientPort: 443,
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
