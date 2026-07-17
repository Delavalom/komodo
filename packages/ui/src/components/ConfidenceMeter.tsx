interface Props {
  score: number;
  size?: "sm" | "md" | "lg";
}

export function ConfidenceMeter({ score, size = "md" }: Props) {
  const color =
    score >= 4
      ? "var(--accent)"
      : score >= 3
        ? "var(--c-minor)"
        : score >= 2
          ? "var(--c-major)"
          : "var(--c-critical)";

  return (
    <div className={`confidence-meter confidence-meter--${size}`}>
      <div className="confidence-meter__segments">
        {[1, 2, 3, 4, 5].map((seg) => (
          <div
            key={seg}
            className="confidence-meter__segment"
            style={{ background: seg <= score ? color : "var(--border-strong)" }}
          />
        ))}
      </div>
      {size !== "sm" && (
        <span className="confidence-meter__label" style={{ color }}>
          {score}/5
        </span>
      )}
    </div>
  );
}
