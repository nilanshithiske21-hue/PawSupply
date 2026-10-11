import { defineConfig } from "vite";

const apiProxy = {
  target: "http://127.0.0.1:3001",
  changeOrigin: false,
};

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": apiProxy,
      "/healthz": apiProxy,
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
