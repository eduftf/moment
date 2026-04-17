import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MomentsList } from "./MomentsList";
import type { Moment } from "../types";

function makeMoment(overrides: Partial<Moment> = {}): Moment {
  return {
    id: "1",
    timestamp: new Date("2024-03-15T14:30:00"),
    trigger: "manual",
    participantCount: 5,
    participants: ["Alice", "Bob"],
    meetingTopic: "Test Meeting",
    captured: true,
    ...overrides,
  };
}

describe("MomentsList", () => {
  it("shows empty message when no moments", () => {
    render(<MomentsList moments={[]} />);

    expect(screen.getByText("No moments captured yet")).toBeInTheDocument();
  });

  it("shows moments count in heading", () => {
    const moments = [makeMoment({ id: "1" }), makeMoment({ id: "2" })];
    render(<MomentsList moments={moments} />);

    expect(screen.getByText("Moments (2)")).toBeInTheDocument();
  });

  it("shows 'Thumbs up' label for reaction trigger", () => {
    render(<MomentsList moments={[makeMoment({ trigger: "reaction" })]} />);

    expect(screen.getByText("Thumbs up")).toBeInTheDocument();
  });

  it("shows peak count for peak trigger", () => {
    render(
      <MomentsList
        moments={[makeMoment({ trigger: "peak", participantCount: 15 })]}
      />
    );

    expect(screen.getByText("Peak: 15")).toBeInTheDocument();
  });

  it("shows 'Manual' label for manual trigger", () => {
    render(<MomentsList moments={[makeMoment({ trigger: "manual" })]} />);

    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("shows 'Saved' for captured moments", () => {
    render(<MomentsList moments={[makeMoment({ captured: true })]} />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows 'Missed' for non-captured moments", () => {
    render(<MomentsList moments={[makeMoment({ captured: false })]} />);

    expect(screen.getByText("Missed")).toBeInTheDocument();
  });

  it("shows 'Reaction' label and custom emoji when emoji is set", () => {
    render(
      <MomentsList
        moments={[makeMoment({ trigger: "reaction", emoji: "\u2764" })]}
      />
    );

    expect(screen.getByText("Reaction")).toBeInTheDocument();
    expect(screen.getByText("\u2764")).toBeInTheDocument();
  });

  it("shows thumbnail when screenshotPath is set", () => {
    render(
      <MomentsList
        moments={[makeMoment({ screenshotPath: "test/img.png" })]}
      />
    );

    const thumb = screen.getByAltText("Screenshot");
    expect(thumb).toBeInTheDocument();
    expect(thumb).toHaveAttribute(
      "src",
      expect.stringContaining("/companion-api/image?path=")
    );
  });

  it("does not show thumbnail without screenshotPath", () => {
    render(<MomentsList moments={[makeMoment()]} />);

    expect(screen.queryByAltText("Screenshot")).not.toBeInTheDocument();
  });

  it("expands moment on click when screenshotPath is set", async () => {
    const user = userEvent.setup();
    render(
      <MomentsList
        moments={[makeMoment({ screenshotPath: "test/img.png" })]}
      />
    );

    const li = screen.getByRole("listitem");
    await user.click(li);

    expect(screen.getByAltText("Screenshot full")).toBeInTheDocument();
  });

  it("shows delete button when expanded with onDeleteMoment", async () => {
    const user = userEvent.setup();
    render(
      <MomentsList
        moments={[makeMoment({ screenshotPath: "test/img.png" })]}
        onDeleteMoment={() => {}}
      />
    );

    const li = screen.getByRole("listitem");
    await user.click(li);

    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onDeleteMoment when delete clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <MomentsList
        moments={[makeMoment({ id: "m1", screenshotPath: "test/img.png" })]}
        onDeleteMoment={onDelete}
      />
    );

    const li = screen.getByRole("listitem");
    await user.click(li);
    await user.click(screen.getByText("Delete"));

    expect(onDelete).toHaveBeenCalledWith("m1");
  });

  it("collapses expanded moment on second click", async () => {
    const user = userEvent.setup();
    render(
      <MomentsList
        moments={[makeMoment({ screenshotPath: "test/img.png" })]}
      />
    );

    const li = screen.getByRole("listitem");
    await user.click(li);
    expect(screen.getByAltText("Screenshot full")).toBeInTheDocument();

    await user.click(li);
    expect(screen.queryByAltText("Screenshot full")).not.toBeInTheDocument();
  });
});
