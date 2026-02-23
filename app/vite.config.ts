import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // When using ngrok, HMR websocket must connect through the tunnel
    hmr: {
      clientPort: 443,
    },
  },
});
