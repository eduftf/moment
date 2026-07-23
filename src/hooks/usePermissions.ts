import { useEffect, useState } from "react";
import { tauri } from "../api/tauri";

export type PermissionState = {
  screen: boolean;
  loading: boolean;
};

/**
 * Polls granted_permissions at intervalMs while any permission is ungranted.
 * Once all are granted, polling stops. Caller can force a re-check via refresh().
 */
export function usePermissions(intervalMs: number = 2000): PermissionState & { refresh: () => Promise<boolean> } {
  const [state, setState] = useState<PermissionState>({ screen: false, loading: true });

  // Returns the freshly-fetched granted flag so callers (and the poll loop)
  // decide off the live value, never a stale render-time snapshot.
  const refresh = async (): Promise<boolean> => {
    try {
      const res = await tauri.grantedPermissions();
      setState({ screen: res.screen, loading: false });
      return res.screen;
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
      return false;
    }
  };

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      // Use the value we just fetched — not `state.screen`, which is frozen at
      // the closure created on the first render and would poll forever.
      const granted = await refresh();
      if (!granted && !cancelled) {
        timer = window.setTimeout(tick, intervalMs);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { ...state, refresh };
}
