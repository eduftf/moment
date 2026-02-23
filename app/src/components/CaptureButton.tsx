interface Props {
  onClick: () => void;
}

export function CaptureButton({ onClick }: Props) {
  return (
    <button className="capture-btn" onClick={onClick}>
      Capture Now
    </button>
  );
}
