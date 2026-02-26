import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
