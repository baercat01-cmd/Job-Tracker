import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      // Support both localhost and OnSpace preview domains
      clientPort: typeof process.env.VITE_HMR_CLIENT_PORT !== 'undefined' 
        ? parseInt(process.env.VITE_HMR_CLIENT_PORT) 
        : undefined,
      protocol: typeof process.env.VITE_HMR_PROTOCOL !== 'undefined'
        ? process.env.VITE_HMR_PROTOCOL as 'ws' | 'wss'
        : undefined,
      host: typeof process.env.VITE_HMR_HOST !== 'undefined'
        ? process.env.VITE_HMR_HOST
        : undefined,
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
