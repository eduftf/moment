/// <reference types="vitest" />
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

function pathSpecificHeaders(): Plugin {
  return {
    name: "path-specific-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        if (req.url?.startsWith("/app")) {
          res.setHeader(
            "Content-Security-Policy",
            "frame-ancestors https://*.zoom.us; default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' wss://*.gtools.space; img-src 'self' data:",
          );
        } else {
          res.setHeader("X-Frame-Options", "DENY");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pathSpecificHeaders()],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app.html"),
        "auth/callback": resolve(__dirname, "auth/callback.html"),
      },
    },
  },
  server: {
    port: 3000,
    allowedHosts: ["moment.gtools.space", ".trycloudflare.com", ".ngrok.io"],
    // When tunneling (ngrok/cloudflared), HMR websocket must connect through the tunnel
    hmr: {
      clientPort: 443,
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
