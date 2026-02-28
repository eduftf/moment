import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompanionOnboarding } from "./CompanionOnboarding";

// Mock the usePlatform hook
vi.mock("../hooks/usePlatform", () => ({
  usePlatform: () => ({
    os: "macos" as const,
    arch: "arm64" as const,
    downloadUrl: "https://github.com/eduftf/moment/releases/latest/download/moment-companion-macos-arm64",
    filename: "moment-companion-macos-arm64",
  }),
}));

describe("CompanionOnboarding", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders setup steps", () => {
    render(<CompanionOnboarding connected={false} onDismiss={() => {}} />);

    expect(screen.getByText("Set up Moment")).toBeInTheDocument();
    expect(screen.getByText("Download Companion")).toBeInTheDocument();
    expect(screen.getByText("Open the file")).toBeInTheDocument();
    expect(screen.getByText("Done!")).toBeInTheDocument();
  });

  it("shows platform-specific download button", () => {
    render(<CompanionOnboarding connected={false} onDismiss={() => {}} />);

    const link = screen.getByText("Download for macOS");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", expect.stringContaining("moment-companion-macos-arm64"));
  });

  it("shows waiting spinner when not connected", () => {
    render(<CompanionOnboarding connected={false} onDismiss={() => {}} />);

    expect(screen.getByText("Waiting for connection...")).toBeInTheDocument();
  });

  it("sets localStorage and fades out when connected", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    const { rerender } = render(
      <CompanionOnboarding connected={false} onDismiss={onDismiss} />
    );

    rerender(<CompanionOnboarding connected={true} onDismiss={onDismiss} />);

    expect(localStorage.getItem("moment-setup-complete")).toBe("true");
    expect(screen.queryByText("Waiting for connection...")).not.toBeInTheDocument();

    vi.advanceTimersByTime(500);
    expect(onDismiss).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("advances to step 2 when download clicked", async () => {
    render(<CompanionOnboarding connected={false} onDismiss={() => {}} />);

    const link = screen.getByText("Download for macOS");
    await userEvent.click(link);

    // Step 2 should now be active (has "active" class)
    const step2 = screen.getByText("Open the file").closest(".onboarding-step");
    expect(step2?.className).toContain("active");
  });
});
