import type { CompanionConfig } from "../hooks/useCompanion";

interface Props {
  config: CompanionConfig;
  onUpdate: (updates: Partial<CompanionConfig>) => void;
}

export function Settings({ config, onUpdate }: Props) {
  return (
    <div className="section">
      <div className="card">
        <div className="section-label">Settings</div>
        <div className="setting-row">
          <span className="setting-label">Capture mode</span>
          <select
            className="setting-select"
            value={config.captureMode}
            onChange={(e) =>
              onUpdate({ captureMode: e.target.value as CompanionConfig["captureMode"] })
            }
          >
            <option value="window">Zoom window</option>
            <option value="video">Video only</option>
            <option value="screen">Full screen</option>
          </select>
        </div>
        <div className="setting-row">
          <span className="setting-label">Save folder</span>
          <input
            className="setting-input"
            type="text"
            value={config.saveDir}
            onChange={(e) => onUpdate({ saveDir: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
