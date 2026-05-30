import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    https: true,
    strictPort: true,
    // Proxy /api/* to the FastAPI backend so iPhone never speaks HTTP directly
    // (mixed-content would be blocked from this HTTPS origin).
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
