interface Props {
  onClick: () => void;
  ready?: boolean;
}

export function CaptureButton({ onClick, ready }: Props) {
  return (
    <button className={`capture-btn${ready ? " pulse" : ""}`} onClick={onClick}>
      <span>&#128247; Capture Now</span>
    </button>
  );
}
