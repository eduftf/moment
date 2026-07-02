import { render, screen, waitFor } from "@testing-library/react";
import { tauri, type MeetingRow } from "../api/tauri";
import { RecentMeetings } from "./RecentMeetings";

vi.mock("../api/tauri", () => ({
  tauri: { getRecentMeetings: vi.fn() },
}));

const mockGet = vi.mocked(tauri.getRecentMeetings);

const row = (over: Partial<MeetingRow> = {}): MeetingRow => ({
  id: "01ID",
  title: "Weekly Standup",
  path: "/Users/x/Moment/standup",
  startedAt: "2026-04-23T10:00:00Z",
  endedAt: null,
  peak: 0,
  ...over,
});

beforeEach(() => {
  mockGet.mockReset();
});

describe("RecentMeetings", () => {
  it("shows the empty state when there are no meetings", async () => {
    mockGet.mockResolvedValue([]);
    render(<RecentMeetings />);
    expect(await screen.findByText("No meetings yet.")).toBeInTheDocument();
  });

  it("renders a meeting title and its in-progress marker", async () => {
    mockGet.mockResolvedValue([row()]);
    render(<RecentMeetings />);
    expect(await screen.findByText("Weekly Standup")).toBeInTheDocument();
    expect(screen.getByText(/in progress/)).toBeInTheDocument();
  });

  it("marks a finished meeting as ended", async () => {
    mockGet.mockResolvedValue([row({ endedAt: "2026-04-23T11:00:00Z" })]);
    render(<RecentMeetings />);
    await screen.findByText("Weekly Standup");
    expect(screen.getByText(/ended/)).toBeInTheDocument();
    expect(screen.queryByText(/in progress/)).not.toBeInTheDocument();
  });

  it("passes the limit prop through to the command", async () => {
    mockGet.mockResolvedValue([]);
    render(<RecentMeetings limit={5} />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(5));
  });

  it("surfaces a load error", async () => {
    mockGet.mockRejectedValue(new Error("db locked"));
    render(<RecentMeetings />);
    expect(await screen.findByText(/db locked/)).toBeInTheDocument();
  });
});
