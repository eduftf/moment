import { useState, useEffect, useCallback } from "react";
import zoomSdk from "@zoom/appssdk";
import { usePlatform } from "../hooks/usePlatform";

interface Props {
  connected: boolean;
  onDismiss: () => void;
}

export function CompanionOnboarding({ connected, onDismiss }: Props) {
  const platform = usePlatform();
  const [step, setStep] = useState(1);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (connected) {
      localStorage.setItem("moment-setup-complete", "true");
      setFadeOut(true);
      const timer = setTimeout(onDismiss, 500);
      return () => clearTimeout(timer);
    }
  }, [connected, onDismiss]);

  const osLabel = platform.os === "macos" ? "macOS" : platform.os === "windows" ? "Windows" : "Linux";

  const handleDownload = useCallback(() => {
    zoomSdk.openUrl({ url: platform.downloadUrl }).catch(() => {
      window.open(platform.downloadUrl, "_blank");
    });
    setStep(2);
  }, [platform.downloadUrl]);

  return (
    <div className={`onboarding-overlay${fadeOut ? " fade-out" : ""}`}>
      <div className="onboarding-card">
        <button className="onboarding-close" onClick={onDismiss} aria-label="Close">&times;</button>
        <div className="onboarding-header">
          <div className="app-logo">M</div>
          <h2 className="onboarding-title">Set up Moment</h2>
          <p className="onboarding-subtitle">
            A small helper app is needed to capture screenshots. One-time setup.
          </p>
        </div>

        <div className="onboarding-steps">
          <div className={`onboarding-step${step >= 1 ? " active" : ""}`}>
            <span className="step-number">1</span>
            <div className="step-content">
              <span className="step-title">Download Companion</span>
              <span className="step-detail">{osLabel} detected</span>
              <button
                className="onboarding-btn"
                onClick={handleDownload}
              >
                Download for {osLabel}
              </button>
            </div>
          </div>

          <div className={`onboarding-step${step >= 2 ? " active" : ""}`}>
            <span className="step-number">2</span>
            <div className="step-content">
              <span className="step-title">Open the file</span>
              <span className="step-detail">
                {platform.os === "macos"
                  ? "Double-click the downloaded file. If blocked, go to System Settings \u2192 Privacy & Security \u2192 Open Anyway."
                  : "Double-click the .exe file. If SmartScreen appears, click More info \u2192 Run anyway."}
              </span>
            </div>
          </div>

          <div className={`onboarding-step${connected ? " active" : ""}`}>
            <span className="step-number">3</span>
            <div className="step-content">
              <span className="step-title">Done!</span>
              <span className="step-detail">
                {connected
                  ? "Companion connected. It will auto-start on login."
                  : "Companion will start automatically on login."}
              </span>
            </div>
          </div>
        </div>

        {!connected && (
          <div className="onboarding-waiting">
            <div className="spinner-small" />
            <span>Waiting for connection...</span>
          </div>
        )}
      </div>
    </div>
  );
}
