import { useState, useEffect, useRef, useCallback } from "react";
import type {
  CaptureCommand,
  StartArchiveCommand,
  ArchiveEventCommand,
  EndArchiveCommand,
} from "../types";

export interface CompanionConfig {
  saveDir: string;
  captureMode: "window" | "screen" | "video";
  allowedReactions?: string[];
}

// Use same-origin WebSocket via Vite proxy (works through tunnel)
const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws-companion`;
const RECONNECT_MS = 5000;

export function useCompanion() {
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<CompanionConfig | null>(null);
  const [archivePath, setArchivePath] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const onCapturedRef = useRef<((timestamp: string, imageUrl: string, path: string) => void) | null>(null);

  const send = useCallback((data: object): boolean => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }
    wsRef.current.send(JSON.stringify(data));
    return true;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "config") {
            setConfig({ saveDir: msg.saveDir, captureMode: msg.captureMode, allowedReactions: msg.allowedReactions });
          } else if (msg.type === "archive-started") {
            setArchivePath(msg.path);
          } else if (msg.type === "captured" && msg.imageUrl) {
            onCapturedRef.current?.(msg.timestamp, msg.imageUrl, msg.path);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        setConfig(null);
        setArchivePath(null);
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

  const capture = useCallback(
    (command: CaptureCommand): boolean => send(command),
    [send]
  );

  const updateConfig = useCallback(
    (updates: Partial<CompanionConfig>) => {
      send({ type: "update-config", ...updates });
    },
    [send]
  );

  const startArchive = useCallback(
    (cmd: StartArchiveCommand): boolean => send(cmd),
    [send]
  );

  const archiveEvent = useCallback(
    (cmd: ArchiveEventCommand): boolean => send(cmd),
    [send]
  );

  const endArchive = useCallback(
    (): boolean => send({ type: "end-archive" } satisfies EndArchiveCommand),
    [send]
  );

  const setOnCaptured = useCallback((cb: (timestamp: string, imageUrl: string, path: string) => void) => {
    onCapturedRef.current = cb;
  }, []);

  const deleteScreenshot = useCallback((path: string): boolean => send({ type: "delete-screenshot", path }), [send]);

  return {
    connected,
    config,
    archivePath,
    capture,
    updateConfig,
    startArchive,
    archiveEvent,
    endArchive,
    setOnCaptured,
    deleteScreenshot,
  };
}
