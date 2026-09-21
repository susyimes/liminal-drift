import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 43133,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:43134",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 43133,
  },
  resolve: {
    alias: {
      "@liminal/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
});
