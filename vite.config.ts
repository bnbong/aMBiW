import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("/three/")) return "three";
            if (
              id.includes("@react-three/fiber") ||
              id.includes("@react-three/drei")
            ) {
              return "r3f";
            }
            if (id.includes("/react") || id.includes("/scheduler")) {
              return "react-vendor";
            }
          }
        },
      },
    },
  },
});
