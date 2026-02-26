import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaptureButton } from "./CaptureButton";

describe("CaptureButton", () => {
  it("renders with correct text", () => {
    render(<CaptureButton onClick={() => {}} />);

    expect(screen.getByRole("button", { name: "Capture Now" })).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<CaptureButton onClick={onClick} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
