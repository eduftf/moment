import { usePermissions } from "../hooks/usePermissions";
import { tauri } from "../api/tauri";

export function PermissionBanner() {
  const { screen, loading, refresh } = usePermissions(2000);

  if (loading || screen) return null;

  const openPrefs = async () => {
    await tauri.openScreenRecordingPrefs();
    // give user a beat, then re-check
    setTimeout(() => void refresh(), 500);
  };

  return (
    <div
      role="alert"
      style={{
        marginTop: 16,
        padding: 16,
        background: "#fff3cd",
        border: "1px solid #ffecb5",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <strong>Screen Recording permission required</strong>
        <div style={{ marginTop: 4, color: "#856404", fontSize: 13 }}>
          Moment needs permission to capture the window you pick. Grant it in System Settings — this banner disappears automatically.
        </div>
      </div>
      <button
        onClick={() => void openPrefs()}
        style={{
          padding: "8px 14px",
          borderRadius: 6,
          border: "1px solid #856404",
          background: "#ffc107",
          color: "#1a1a1a",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Open System Settings
      </button>
    </div>
  );
}
