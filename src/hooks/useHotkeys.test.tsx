import { renderHook, waitFor } from "@testing-library/react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { tauri } from "../api/tauri";
import { useHotkeys } from "./useHotkeys";

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../api/tauri", () => ({
  tauri: {
    toggleSession: vi.fn().mockResolvedValue(undefined),
    captureManual: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockRegister = vi.mocked(register);
const mockUnregister = vi.mocked(unregister);
const mockToggle = vi.mocked(tauri.toggleSession);
const mockCapture = vi.mocked(tauri.captureManual);

const TOGGLE = "CommandOrControl+Shift+M";
const CAPTURE = "CommandOrControl+Shift+Space";

// Pull the callback the hook handed to register(accelerator, cb).
function handlerFor(accelerator: string): () => void | Promise<void> {
  const call = mockRegister.mock.calls.find((c) => c[0] === accelerator);
  if (!call) throw new Error(`no register call for ${accelerator}`);
  return call[1] as () => void | Promise<void>;
}

beforeEach(() => {
  mockRegister.mockClear();
  mockUnregister.mockClear();
  mockRegister.mockResolvedValue(undefined);
  mockUnregister.mockResolvedValue(undefined);
  mockToggle.mockReset().mockResolvedValue(undefined as never);
  mockCapture.mockReset().mockResolvedValue(undefined as never);
});

describe("useHotkeys", () => {
  it("registers both the toggle and capture accelerators", async () => {
    renderHook(() => useHotkeys());
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2));
    const accelerators = mockRegister.mock.calls.map((c) => c[0]);
    expect(accelerators).toContain(TOGGLE);
    expect(accelerators).toContain(CAPTURE);
  });

  it("unregisters both accelerators on unmount", async () => {
    const { unmount } = renderHook(() => useHotkeys());
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2));
    unmount();
    await waitFor(() => expect(mockUnregister).toHaveBeenCalledTimes(2));
    const accelerators = mockUnregister.mock.calls.map((c) => c[0]);
    expect(accelerators).toContain(TOGGLE);
    expect(accelerators).toContain(CAPTURE);
  });

  it("the toggle handler invokes toggleSession", async () => {
    renderHook(() => useHotkeys());
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2));
    await handlerFor(TOGGLE)();
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("the capture handler invokes captureManual", async () => {
    renderHook(() => useHotkeys());
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2));
    await handlerFor(CAPTURE)();
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it("routes a toggle failure through onError", async () => {
    mockToggle.mockRejectedValueOnce(new Error("boom"));
    const onError = vi.fn();
    renderHook(() => useHotkeys({ onError }));
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2));
    await handlerFor(TOGGLE)();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^toggle: .*boom/));
  });

  it("routes a capture failure through onError", async () => {
    mockCapture.mockRejectedValueOnce(new Error("nope"));
    const onError = vi.fn();
    renderHook(() => useHotkeys({ onError }));
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2));
    await handlerFor(CAPTURE)();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^capture: .*nope/));
  });

  it("routes a registration failure through onError", async () => {
    mockRegister.mockRejectedValueOnce(new Error("denied"));
    const onError = vi.fn();
    renderHook(() => useHotkeys({ onError }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^register: .*denied/)),
    );
  });
});
