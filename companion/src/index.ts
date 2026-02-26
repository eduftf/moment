#!/usr/bin/env node

import { WebSocketServer } from "ws";
import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { createServer } from "node:http";
import { sanitize, formatTimestamp } from "./utils.js";

const PORT = 54321;
const CONFIG_PATH = join(homedir(), ".moment-config.json");

interface VideoMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Config {
  saveDir: string;
  captureMode: "window" | "screen" | "video";
  videoMargins: VideoMargins;
}

const DEFAULT_CONFIG: Config = {
  saveDir: join(homedir(), "Moment"),
  captureMode: "window",
  videoMargins: { top: 50, bottom: 50, left: 10, right: 10 },
};

let config: Config = { ...DEFAULT_CONFIG };

async function loadConfig(): Promise<void> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const saved = JSON.parse(raw);
    config = { ...DEFAULT_CONFIG, ...saved };
  } catch {
    // No config file yet — use defaults
  }
}

async function saveConfig(): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

interface CaptureCommand {
  type: "capture";
  trigger: "reaction" | "peak" | "manual";
  timestamp: string;
  participants: string[];
  participantCount: number;
  meetingTopic: string;
}

interface WindowInfo {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const FIND_ZOOM_WINDOW_SWIFT = `
import CoreGraphics
let windows = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
var bestId: Int? = nil
var bestArea = 0
var bestBounds: [String: Any]? = nil
for w in windows {
    guard let owner = w["kCGWindowOwnerName"] as? String, owner == "zoom.us",
          let bounds = w["kCGWindowBounds"] as? [String: Any],
          let width = bounds["Width"] as? Int, let height = bounds["Height"] as? Int,
          let wid = w["kCGWindowNumber"] as? Int,
          let name = w["kCGWindowName"] as? String else { continue }
    let area = width * height
    if (name.contains("Meeting") || name.contains("Webinar")) && area > bestArea {
        bestId = wid
        bestArea = area
        bestBounds = bounds
    }
}
if let id = bestId, let b = bestBounds,
   let x = b["X"] as? Int, let y = b["Y"] as? Int,
   let w = b["Width"] as? Int, let h = b["Height"] as? Int {
    print("\\(id)|\\(x)|\\(y)|\\(w)|\\(h)")
} else { print("") }
`;

/** Find the Zoom Meeting window on macOS using CoreGraphics via Swift */
async function findZoomWindow(): Promise<WindowInfo | null> {
  if (platform() !== "darwin") return null;

  return new Promise((resolve) => {
    execFile("swift", ["-e", FIND_ZOOM_WINDOW_SWIFT], (error, stdout) => {
      if (error) { resolve(null); return; }
      const parts = stdout.trim().split("|");
      if (parts.length < 5) { resolve(null); return; }
      const [id, x, y, width, height] = parts.map(Number);
      if (isNaN(id)) { resolve(null); return; }
      resolve({ id, x, y, width, height });
    });
  });
}

async function takeScreenshot(filepath: string): Promise<void> {
  const os = platform();

  if (os === "darwin") {
    let args: string[];

    if (config.captureMode === "window" || config.captureMode === "video") {
      const window = await findZoomWindow();
      if (window) {
        if (config.captureMode === "video") {
          const m = config.videoMargins;
          const rx = window.x + m.left;
          const ry = window.y + m.top;
          const rw = window.width - m.left - m.right;
          const rh = window.height - m.top - m.bottom;
          args = ["-R", `${rx},${ry},${rw},${rh}`, "-x", filepath];
        } else {
          args = [`-l${window.id}`, "-x", filepath];
        }
      } else {
        console.warn("Zoom Meeting window not found, falling back to full screen");
        args = ["-x", filepath];
      }
    } else {
      args = ["-x", filepath];
    }

    return new Promise((resolve, reject) => {
      execFile("screencapture", args, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  if (os === "win32") {
    return new Promise((resolve, reject) => {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
        $bitmap.Save('${filepath}')
        $graphics.Dispose()
        $bitmap.Dispose()
      `;
      execFile("powershell", ["-Command", psScript], (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  // Linux: try gnome-screenshot, fallback to ImageMagick
  return new Promise((resolve, reject) => {
    execFile("gnome-screenshot", ["-f", filepath], (error) => {
      if (error) {
        execFile("import", ["-window", "root", filepath], (err2) => {
          if (err2) reject(err2);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

async function handleCapture(data: CaptureCommand): Promise<string> {
  const dir = join(config.saveDir, sanitize(data.meetingTopic));
  await mkdir(dir, { recursive: true });

  const ts = formatTimestamp(data.timestamp);
  const baseName = `${ts}_${data.trigger}`;
  const pngPath = join(dir, `${baseName}.png`);
  const jsonPath = join(dir, `${baseName}.json`);

  await takeScreenshot(pngPath);

  const metadata = {
    timestamp: data.timestamp,
    trigger: data.trigger,
    participants: data.participants,
    participantCount: data.participantCount,
    meetingTopic: data.meetingTopic,
    captureMode: config.captureMode,
  };
  await writeFile(jsonPath, JSON.stringify(metadata, null, 2));

  console.log(`Captured: ${pngPath}`);
  return pngPath;
}

// --- Server ---

await loadConfig();

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Moment Companion OK");
});

const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log(`Moment Companion listening on ws://localhost:${PORT}`);
  console.log(`Capture mode: ${config.captureMode}`);
  console.log(`Save directory: ${config.saveDir}`);
});

wss.on("connection", (ws) => {
  console.log("Zoom App connected");

  // Send current config to the app
  ws.send(JSON.stringify({ type: "config", ...config }));

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "capture") {
        const path = await handleCapture(msg as CaptureCommand);
        ws.send(JSON.stringify({ type: "captured", timestamp: msg.timestamp, path }));
      }

      if (msg.type === "update-config") {
        if (msg.saveDir) config.saveDir = msg.saveDir;
        if (msg.captureMode) config.captureMode = msg.captureMode;
        if (msg.videoMargins) config.videoMargins = { ...config.videoMargins, ...msg.videoMargins };
        await saveConfig();
        console.log(`Config updated: mode=${config.captureMode}, dir=${config.saveDir}`);
        for (const client of wss.clients) {
          client.send(JSON.stringify({ type: "config", ...config }));
        }
      }

      if (msg.type === "get-config") {
        ws.send(JSON.stringify({ type: "config", ...config }));
      }
    } catch (e) {
      console.error("Error:", e);
      ws.send(JSON.stringify({ type: "error", message: String(e) }));
    }
  });

  ws.on("close", () => console.log("Zoom App disconnected"));
});
