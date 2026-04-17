import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TriggerSettings } from "./TriggerSettings";
import { ZOOM_REACTIONS } from "../types";

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

  it("does not render emoji picker when reaction disabled", () => {
    render(
      <TriggerSettings
        reactionEnabled={false}
        peakEnabled={true}
        onToggleReaction={() => {}}
        onTogglePeak={() => {}}
        allowedReactions={ZOOM_REACTIONS.map(r => r.unicode)}
        onToggleEmoji={() => {}}
      />
    );

    expect(screen.queryByLabelText("Thumbs up")).not.toBeInTheDocument();
  });

  it("renders emoji picker when reaction enabled with allowedReactions", () => {
    render(
      <TriggerSettings
        reactionEnabled={true}
        peakEnabled={true}
        onToggleReaction={() => {}}
        onTogglePeak={() => {}}
        allowedReactions={ZOOM_REACTIONS.map(r => r.unicode)}
        onToggleEmoji={() => {}}
      />
    );

    const emojiButtons = screen.getAllByRole("button");
    expect(emojiButtons).toHaveLength(6);
  });

  it("marks selected emojis", () => {
    render(
      <TriggerSettings
        reactionEnabled={true}
        peakEnabled={true}
        onToggleReaction={() => {}}
        onTogglePeak={() => {}}
        allowedReactions={["U+1F44D", "U+2764"]}
        onToggleEmoji={() => {}}
      />
    );

    expect(screen.getByLabelText("Thumbs up")).toHaveClass("selected");
    expect(screen.getByLabelText("Heart")).toHaveClass("selected");
    expect(screen.getByLabelText("Clap")).not.toHaveClass("selected");
    expect(screen.getByLabelText("Laugh")).not.toHaveClass("selected");
    expect(screen.getByLabelText("Surprised")).not.toHaveClass("selected");
    expect(screen.getByLabelText("Party")).not.toHaveClass("selected");
  });

  it("calls onToggleEmoji when emoji clicked", async () => {
    const onToggleEmoji = vi.fn();
    render(
      <TriggerSettings
        reactionEnabled={true}
        peakEnabled={true}
        onToggleReaction={() => {}}
        onTogglePeak={() => {}}
        allowedReactions={ZOOM_REACTIONS.map(r => r.unicode)}
        onToggleEmoji={onToggleEmoji}
      />
    );

    await userEvent.click(screen.getByLabelText("Clap"));

    expect(onToggleEmoji).toHaveBeenCalledWith("U+1F44F");
  });

  it("does not render emoji picker without allowedReactions prop", () => {
    render(
      <TriggerSettings
        reactionEnabled={true}
        peakEnabled={true}
        onToggleReaction={() => {}}
        onTogglePeak={() => {}}
      />
    );

    expect(screen.queryByLabelText("Thumbs up")).not.toBeInTheDocument();
  });
});
