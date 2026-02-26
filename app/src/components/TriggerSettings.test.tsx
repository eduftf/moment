import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TriggerSettings } from "./TriggerSettings";

describe("TriggerSettings", () => {
  it("renders both toggles", () => {
    render(
      <TriggerSettings
        reactionEnabled={true}
        peakEnabled={true}
        onToggleReaction={() => {}}
        onTogglePeak={() => {}}
      />
    );

    expect(screen.getByText("Reaction capture")).toBeInTheDocument();
    expect(screen.getByText("Peak participants")).toBeInTheDocument();
  });

  it("reflects enabled state in checkboxes", () => {
    render(
      <TriggerSettings
        reactionEnabled={true}
        peakEnabled={false}
        onToggleReaction={() => {}}
        onTogglePeak={() => {}}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("calls onToggleReaction when reaction checkbox clicked", async () => {
    const onToggleReaction = vi.fn();
    render(
      <TriggerSettings
        reactionEnabled={true}
        peakEnabled={true}
        onToggleReaction={onToggleReaction}
        onTogglePeak={() => {}}
      />
    );

    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    expect(onToggleReaction).toHaveBeenCalledOnce();
  });

  it("calls onTogglePeak when peak checkbox clicked", async () => {
    const onTogglePeak = vi.fn();
    render(
      <TriggerSettings
        reactionEnabled={true}
        peakEnabled={true}
        onToggleReaction={() => {}}
        onTogglePeak={onTogglePeak}
      />
    );

    await userEvent.click(screen.getAllByRole("checkbox")[1]);

    expect(onTogglePeak).toHaveBeenCalledOnce();
  });
});
