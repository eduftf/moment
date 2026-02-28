import { writeFile, readFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";

const LABEL = "space.gtools.moment.companion";

function getPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function getStartupPath(): string {
  const appdata = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  return join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Moment Companion.vbs");
}

export async function isAutoStartEnabled(): Promise<boolean> {
  const os = platform();
  try {
    if (os === "darwin") {
      await readFile(getPlistPath(), "utf-8");
      return true;
    }
    if (os === "win32") {
      await readFile(getStartupPath(), "utf-8");
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function setupAutoStart(): Promise<void> {
  const os = platform();
  const execPath = process.execPath;

  if (os === "darwin") {
    const plistDir = join(homedir(), "Library", "LaunchAgents");
    await mkdir(plistDir, { recursive: true });
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${execPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${join(homedir(), ".moment-companion.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), ".moment-companion.log")}</string>
</dict>
</plist>`;
    await writeFile(getPlistPath(), plist);
    console.log("Auto-start configured (macOS LaunchAgent)");
  }

  if (os === "win32") {
    const vbs = `Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.Run """${execPath}""", 0, False`;
    await writeFile(getStartupPath(), vbs);
    console.log("Auto-start configured (Windows Startup)");
  }
}

export async function removeAutoStart(): Promise<void> {
  const os = platform();
  try {
    if (os === "darwin") await unlink(getPlistPath());
    if (os === "win32") await unlink(getStartupPath());
  } catch {
    // Already removed or doesn't exist
  }
}
