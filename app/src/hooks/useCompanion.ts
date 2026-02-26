import { useState, useEffect, useRef, useCallback } from "react";
import type { CaptureCommand } from "../types";

export interface CompanionConfig {
  saveDir: string;
  captureMode: "window" | "screen" | "video";
}

// Use same-origin WebSocket via Vite proxy (works through tunnel)
const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws-companion`;
const RECONNECT_MS = 5000;

export function useCompanion() {
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<CompanionConfig | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "config") {
            setConfig({ saveDir: msg.saveDir, captureMode: msg.captureMode });
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        setConfig(null);
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch {
      reconnectTimer.current = setTimeout(connect, RECONNECT_MS);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const capture = useCallback((command: CaptureCommand): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    wsRef.current.send(JSON.stringify(command));
    return true;
  }, []);

  const updateConfig = useCallback((updates: Partial<CompanionConfig>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "update-config", ...updates }));
  }, []);

  return { connected, config, capture, updateConfig };
}
