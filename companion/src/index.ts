#!/usr/bin/env node

import { WebSocketServer } from "ws";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";

const PORT = 54321;
const BASE_DIR = join(homedir(), "Moment");

interface CaptureCommand {
  type: "capture";
  trigger: "reaction" | "peak" | "manual";
  timestamp: string;
  participants: string[];
  participantCount: number;
  meetingTopic: string;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9\s\-_]/g, "").trim().replace(/\s+/g, "-") || "meeting";
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function takeScreenshot(filepath: string): Promise<void> {
  const os = platform();

  return new Promise((resolve, reject) => {
    if (os === "darwin") {
      execFile("screencapture", ["-x", filepath], (error) => {
        if (error) reject(error);
        else resolve();
      });
    } else if (os === "win32") {
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
    } else {
      // Linux: try gnome-screenshot
      execFile("gnome-screenshot", ["-f", filepath], (error) => {
        if (error) {
          // Fallback to ImageMagick import
          execFile("import", ["-window", "root", filepath], (err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    }
  });
}

async function handleCapture(data: CaptureCommand): Promise<void> {
  const dir = join(BASE_DIR, sanitize(data.meetingTopic));
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
  };
  await writeFile(jsonPath, JSON.stringify(metadata, null, 2));

  console.log(`Captured: ${pngPath}`);
}

const wss = new WebSocketServer({ port: PORT });

console.log(`Moment Companion listening on ws://localhost:${PORT}`);
console.log(`Screenshots will be saved to ${BASE_DIR}/`);

wss.on("connection", (ws) => {
  console.log("Zoom App connected");

  ws.on("message", async (raw) => {
    try {
      const data: CaptureCommand = JSON.parse(raw.toString());
      if (data.type === "capture") {
        await handleCapture(data);
        ws.send(JSON.stringify({ type: "captured", timestamp: data.timestamp }));
      }
    } catch (e) {
      console.error("Error:", e);
      ws.send(JSON.stringify({ type: "error", message: String(e) }));
    }
  });

  ws.on("close", () => console.log("Zoom App disconnected"));
});
