import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "./StatusBar";

describe("StatusBar", () => {
  it("shows Listening when SDK is ready", () => {
    render(
      <StatusBar
        sdkReady={true}
        companionConnected={false}
        participants={{ current: 5, peak: 8, names: [] }}
      />
    );

    expect(screen.getByText("Listening")).toBeInTheDocument();
  });

  it("shows Connecting when SDK is not ready", () => {
    render(
      <StatusBar
        sdkReady={false}
        companionConnected={false}
        participants={{ current: 1, peak: 1, names: [] }}
      />
    );

    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it("shows participant count", () => {
    render(
      <StatusBar
        sdkReady={true}
        companionConnected={false}
        participants={{ current: 5, peak: 12, names: [] }}
      />
    );

    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("shows connected when companion is connected", () => {
    render(
      <StatusBar
        sdkReady={true}
        companionConnected={true}
        participants={{ current: 1, peak: 1, names: [] }}
      />
    );

    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });

  it("shows not running when companion is disconnected", () => {
    render(
      <StatusBar
        sdkReady={true}
        companionConnected={false}
        participants={{ current: 1, peak: 1, names: [] }}
      />
    );

    expect(screen.getByText(/not running/i)).toBeInTheDocument();
  });
});
