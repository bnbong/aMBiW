type ControlBarProps = {
  engineOn: boolean;
  indicatorOn: boolean;
  onToggleEngine: () => void;
  onToggleIndicator: () => void;
  disabled?: boolean;
};

export function ControlBar({
  engineOn,
  indicatorOn,
  onToggleEngine,
  onToggleIndicator,
  disabled,
}: ControlBarProps) {
  return (
    <div className="control-bar" role="group" aria-label="Soundscape controls">
      <button
        type="button"
        className="control-button"
        onClick={onToggleEngine}
        data-active={engineOn}
        aria-pressed={engineOn}
        disabled={disabled}
      >
        <span className="dot" aria-hidden="true" />
        {engineOn ? "Stop engine" : "Start engine"}
      </button>
      <button
        type="button"
        className="control-button"
        onClick={onToggleIndicator}
        data-active={indicatorOn}
        aria-pressed={indicatorOn}
        disabled={disabled}
      >
        <span className="dot" aria-hidden="true" />
        {indicatorOn ? "Indicator off" : "Indicator"}
      </button>
    </div>
  );
}
