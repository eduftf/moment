import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { tauri } from "../api/tauri";
import { PermissionBanner } from "./PermissionBanner";

// PermissionBanner drives usePermissions, which polls granted_permissions and,
// on click, opens the system prefs. Mock the whole API surface both touch.
vi.mock("../api/tauri", () => ({
  tauri: {
    grantedPermissions: vi.fn(),
    openScreenRecordingPrefs: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockGranted = vi.mocked(tauri.grantedPermissions);
const mockOpenPrefs = vi.mocked(tauri.openScreenRecordingPrefs);

beforeEach(() => {
  mockGranted.mockReset();
  mockOpenPrefs.mockReset().mockResolvedValue(undefined as never);
});

describe("PermissionBanner", () => {
  it("renders nothing once screen permission is granted", async () => {
    mockGranted.mockResolvedValue({ screen: true });
    render(<PermissionBanner />);
    await waitFor(() => expect(mockGranted).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the banner while screen permission is missing", async () => {
    mockGranted.mockResolvedValue({ screen: false });
    render(<PermissionBanner />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Screen Recording permission required/i);
    expect(screen.getByRole("button", { name: /Open System Settings/i })).toBeInTheDocument();
  });

  it("opens system settings when the button is clicked", async () => {
    mockGranted.mockResolvedValue({ screen: false });
    render(<PermissionBanner />);
    const button = await screen.findByRole("button", { name: /Open System Settings/i });
    fireEvent.click(button);
    await waitFor(() => expect(mockOpenPrefs).toHaveBeenCalledTimes(1));
  });
});
