export interface PlatformInfo {
  os: "macos" | "windows" | "linux" | "unknown";
  arch: "arm64" | "x64";
  downloadUrl: string;
  filename: string;
}

const REPO = "eduftf/moment";
const LATEST = `https://github.com/${REPO}/releases/latest/download`;

export function usePlatform(): PlatformInfo {
  const ua = navigator.userAgent;

  let os: PlatformInfo["os"] = "unknown";
  if (ua.includes("Mac")) os = "macos";
  else if (ua.includes("Win")) os = "windows";
  else if (ua.includes("Linux")) os = "linux";

  // Default to arm64 for macOS (most modern Macs), x64 for others
  let arch: PlatformInfo["arch"] = os === "macos" ? "arm64" : "x64";

  // Chromium-based browsers (including Zoom's embedded browser) expose userAgentData
  const uaData = (navigator as unknown as { userAgentData?: { architecture?: string } }).userAgentData;
  if (uaData?.architecture) {
    arch = uaData.architecture === "arm" ? "arm64" : "x64";
  }

  let filename: string;
  if (os === "windows") {
    filename = "moment-companion-win-x64.exe";
  } else if (os === "macos") {
    filename = `moment-companion-macos-${arch}`;
  } else {
    filename = "moment-companion-linux-x64";
  }

  return {
    os,
    arch,
    downloadUrl: `${LATEST}/${filename}`,
    filename,
  };
}
