import { useState } from "react";
import { useHotkeys } from "./hooks/useHotkeys";
import { PermissionBanner } from "./components/PermissionBanner";

export default function App() {
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  useHotkeys({ onError: (r) => setHotkeyError(r) });

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1 style={{ margin: 0 }}>Moment</h1>
      <p style={{ marginTop: 4, color: "#666" }}>
        Local meeting archiver — M1 capture foundation
      </p>
      <PermissionBanner />
      {hotkeyError && (
        <div style={{ marginTop: 16, padding: 12, background: "#fff3cd", borderRadius: 6 }}>
          Hotkeys disabled: {hotkeyError}. Grant Accessibility permission in System Settings.
        </div>
      )}
      <p style={{ marginTop: 24, color: "#666", fontSize: 13 }}>
        ⌘⇧M toggle recording · ⌘⇧Space manual capture
      </p>
    </main>
  );
}
