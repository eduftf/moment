import { invoke } from "@tauri-apps/api/core";
import { tauri } from "./tauri";

// Mock the Tauri IPC bridge; every wrapper must funnel through this.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(undefined as never);
});

describe("tauri command wrappers", () => {
  it("getWindows calls get_windows", async () => {
    await tauri.getWindows();
    expect(mockInvoke).toHaveBeenCalledWith("get_windows");
  });

  it("startSession passes windowId + title", async () => {
    await tauri.startSession(7, "Standup");
    expect(mockInvoke).toHaveBeenCalledWith("start_session", {
      windowId: 7,
      title: "Standup",
    });
  });

  it("startSession forwards an explicit null title", async () => {
    await tauri.startSession(7, null);
    expect(mockInvoke).toHaveBeenCalledWith("start_session", {
      windowId: 7,
      title: null,
    });
  });

  it("stopSession calls stop_session", async () => {
    await tauri.stopSession();
    expect(mockInvoke).toHaveBeenCalledWith("stop_session");
  });

  it("sessionState calls session_state", async () => {
    await tauri.sessionState();
    expect(mockInvoke).toHaveBeenCalledWith("session_state");
  });

  it("captureManual calls capture_manual", async () => {
    await tauri.captureManual();
    expect(mockInvoke).toHaveBeenCalledWith("capture_manual");
  });

  it("grantedPermissions calls granted_permissions", async () => {
    await tauri.grantedPermissions();
    expect(mockInvoke).toHaveBeenCalledWith("granted_permissions");
  });

  it("openScreenRecordingPrefs calls open_screen_recording_prefs", async () => {
    await tauri.openScreenRecordingPrefs();
    expect(mockInvoke).toHaveBeenCalledWith("open_screen_recording_prefs");
  });

  it("getRecentMeetings defaults limit to 1", async () => {
    await tauri.getRecentMeetings();
    expect(mockInvoke).toHaveBeenCalledWith("get_recent_meetings", { limit: 1 });
  });

  it("getRecentMeetings passes an explicit limit", async () => {
    await tauri.getRecentMeetings(5);
    expect(mockInvoke).toHaveBeenCalledWith("get_recent_meetings", { limit: 5 });
  });

  it("toggleSession with no args sends undefined windowId and null title", async () => {
    await tauri.toggleSession();
    expect(mockInvoke).toHaveBeenCalledWith("toggle_session", {
      windowId: undefined,
      title: null,
    });
  });

  it("toggleSession coalesces an undefined title to null", async () => {
    await tauri.toggleSession(3);
    expect(mockInvoke).toHaveBeenCalledWith("toggle_session", {
      windowId: 3,
      title: null,
    });
  });

  it("toggleSession preserves a provided title", async () => {
    await tauri.toggleSession(3, "Retro");
    expect(mockInvoke).toHaveBeenCalledWith("toggle_session", {
      windowId: 3,
      title: "Retro",
    });
  });

  it("returns whatever invoke resolves with", async () => {
    const rows = [{ id: "a", title: "T", path: "/p", startedAt: "x", endedAt: null, peak: 0 }];
    mockInvoke.mockResolvedValueOnce(rows as never);
    await expect(tauri.getRecentMeetings(1)).resolves.toEqual(rows);
  });
});
