import { useEffect } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { tauri } from "../api/tauri";

const HOTKEY_TOGGLE = "CommandOrControl+Shift+M";
const HOTKEY_CAPTURE = "CommandOrControl+Shift+Space";

/**
 * Binds the two M1 global hotkeys.
 *
 * - Toggle calls toggle_session(undefined, null). The Rust side rejects with
 *   "window_id required when starting" if idle — the caller (tray popover or
 *   main UI) is responsible for kicking off an initial window pick. This hook
 *   only enables "stop from anywhere" for now; full start-from-hotkey lands
 *   when the tray popover exposes a default window (Task 13-14 / future).
 * - Capture calls capture_manual; silently no-ops when not recording (the
 *   command itself is a no-op in idle thanks to the state check).
 */
export function useHotkeys(opts: { onError?: (reason: string) => void } = {}): void {
  const onError = opts.onError ?? ((r) => console.warn("hotkey:", r));

  useEffect(() => {
    let cancelled = false;

    const wire = async () => {
      try {
        await register(HOTKEY_TOGGLE, async () => {
          try {
            await tauri.toggleSession();
          } catch (e) {
            onError(`toggle: ${String(e)}`);
          }
        });
        await register(HOTKEY_CAPTURE, async () => {
          try {
            await tauri.captureManual();
          } catch (e) {
            onError(`capture: ${String(e)}`);
          }
        });
      } catch (e) {
        if (!cancelled) onError(`register: ${String(e)}`);
      }
    };

    void wire();

    return () => {
      cancelled = true;
      void unregister(HOTKEY_TOGGLE).catch(() => {});
      void unregister(HOTKEY_CAPTURE).catch(() => {});
    };
  }, [onError]);
}
