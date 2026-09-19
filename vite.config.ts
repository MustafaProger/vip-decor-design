import { defineConfig } from "vite";
import { blogPages } from "./scripts/blog-vite-plugin";
import react from "@vitejs/plugin-react";
const apiTarget =
  process.env.CMS_API_TARGET ||
  `http://127.0.0.1:${process.env.INQUIRY_PORT || 3001}`;
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
    proxy: {
      "/api": apiTarget,
      "/data/site-content.json": {
        target: apiTarget,
        rewrite: () => "/api/content",
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": apiTarget,
      "/data/site-content.json": {
        target: apiTarget,
        rewrite: () => "/api/content",
      },
    },
  },
});
