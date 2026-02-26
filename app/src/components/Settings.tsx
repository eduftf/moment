import type { CompanionConfig } from "../hooks/useCompanion";

interface Props {
  config: CompanionConfig;
  onUpdate: (updates: Partial<CompanionConfig>) => void;
}

export function Settings({ config, onUpdate }: Props) {
  return (
    <div className="section">
      <h3>Settings</h3>
      <label className="setting-row">
        <span className="setting-label">Capture mode</span>
        <select
          className="setting-select"
          value={config.captureMode}
          onChange={(e) =>
            onUpdate({ captureMode: e.target.value as CompanionConfig["captureMode"] })
          }
        >
          <option value="window">Zoom window</option>
          <option value="screen">Full screen</option>
        </select>
      </label>
      <label className="setting-row">
        <span className="setting-label">Save folder</span>
        <input
          className="setting-input"
          type="text"
          value={config.saveDir}
          onChange={(e) => onUpdate({ saveDir: e.target.value })}
        />
      </label>
    </div>
  );
}
