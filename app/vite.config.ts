/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: true,
    // When tunneling (ngrok/cloudflared), HMR websocket must connect through the tunnel
    hmr: {
      clientPort: 443,
    },
    headers: {
      "Strict-Transport-Security": "max-age=31536000",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "frame-ancestors https://*.zoom.us",
    },
    proxy: {
      "/ws-companion": {
        target: "ws://localhost:54321",
        ws: true,
        rewriteWsOrigin: true,
      },
      "/companion-api": {
        target: "http://localhost:54321",
        rewrite: (path) => path.replace(/^\/companion-api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
