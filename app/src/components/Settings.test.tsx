import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "./Settings";
import type { CompanionConfig } from "../hooks/useCompanion";

describe("Settings", () => {
  const defaultConfig: CompanionConfig = {
    captureMode: "window",
    saveDir: "~/Moment",
  };

  it("renders settings heading", () => {
    render(<Settings config={defaultConfig} onUpdate={() => {}} />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows current capture mode in select", () => {
    render(<Settings config={{ ...defaultConfig, captureMode: "screen" }} onUpdate={() => {}} />);

    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("screen");
  });

  it("shows current save folder in input", () => {
    render(<Settings config={{ ...defaultConfig, saveDir: "/tmp/screenshots" }} onUpdate={() => {}} />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("/tmp/screenshots");
  });

  it("calls onUpdate with captureMode when select changes", async () => {
    const onUpdate = vi.fn();
    render(<Settings config={defaultConfig} onUpdate={onUpdate} />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "screen");

    expect(onUpdate).toHaveBeenCalledWith({ captureMode: "screen" });
  });

  it("calls onUpdate with saveDir when input changes", () => {
    const onUpdate = vi.fn();
    render(<Settings config={defaultConfig} onUpdate={onUpdate} />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "/new/path" },
    });

    expect(onUpdate).toHaveBeenCalledWith({ saveDir: "/new/path" });
  });
});
