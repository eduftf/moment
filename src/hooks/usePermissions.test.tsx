import { renderHook, waitFor } from "@testing-library/react";
import { tauri } from "../api/tauri";
import { usePermissions } from "./usePermissions";

// usePermissions polls granted_permissions on an interval until the screen
// permission is granted, then must stop. Mock the one API it touches.
vi.mock("../api/tauri", () => ({
  tauri: {
    grantedPermissions: vi.fn(),
  },
}));

const mockGranted = vi.mocked(tauri.grantedPermissions);

beforeEach(() => {
  mockGranted.mockReset();
});

describe("usePermissions", () => {
  it("keeps polling while screen permission is ungranted", async () => {
    mockGranted.mockResolvedValue({ screen: false });
    const { result, unmount } = renderHook(() => usePermissions(20));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const afterFirst = mockGranted.mock.calls.length;
    // The interval must fire again while still ungranted.
    await waitFor(() =>
      expect(mockGranted.mock.calls.length).toBeGreaterThan(afterFirst),
    );
    unmount();
  });

  it("stops polling once screen permission is granted (no stale closure)", async () => {
    // Ungranted on the first poll, granted from the second onward.
    mockGranted
      .mockResolvedValueOnce({ screen: false })
      .mockResolvedValue({ screen: true });

    const { result } = renderHook(() => usePermissions(20));

    // Wait until the hook observes the grant.
    await waitFor(() => expect(result.current.screen).toBe(true));

    const callsAtGrant = mockGranted.mock.calls.length;
    // Give the interval several chances to fire again. With the stale-closure
    // bug the loop reads a frozen `screen === false` and keeps polling forever;
    // the fix must leave the call count unchanged.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(mockGranted.mock.calls.length).toBe(callsAtGrant);
  });

  it("stops polling when screen is already granted on the first poll", async () => {
    mockGranted.mockResolvedValue({ screen: true });

    const { result } = renderHook(() => usePermissions(20));

    await waitFor(() => expect(result.current.screen).toBe(true));
    const callsAtGrant = mockGranted.mock.calls.length;
    expect(callsAtGrant).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(mockGranted.mock.calls.length).toBe(1);
  });
});
