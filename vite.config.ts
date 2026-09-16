import { defineConfig } from "vite";
import { blogPages } from "./scripts/blog-vite-plugin";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react(), blogPages()],
  ssr: {
    noExternal: ["react-router-dom", "react-router"],
    resolve: {
      conditions: ["module", "module-sync", "node", "development|production"],
    },
  },
  optimizeDeps: { entries: ["index.html"] },
  server: {
    port: 5180,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
  preview: { port: 4173, proxy: { "/api": "http://127.0.0.1:3001" } },
});
