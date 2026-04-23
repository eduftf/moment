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
export function usePermissions(intervalMs: number = 2000): PermissionState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<PermissionState>({ screen: false, loading: true });

  const refresh = async () => {
    try {
      const res = await tauri.grantedPermissions();
      setState({ screen: res.screen, loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await refresh();
      if (!state.screen && !cancelled) {
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
