"use client";

interface SlideTileProps {
  readonly index: number;
  /** Rendered Canva image; falls back to a text tile while images load. */
  readonly url?: string;
  readonly headline?: string;
  readonly active?: boolean;
  readonly onSelect?: () => void;
  readonly variant?: "thumb" | "card";
}

/** Tone per page so the text fallback echoes the template's rhythm (dark hook, accent CTA). */
function toneOf(index: number): "dark" | "light" | "accent" {
  if (index === 0) return "dark";
  if (index === 7) return "accent";
  return "light";
}

export function SlideTile({ index, url, headline, active, onSelect, variant = "thumb" }: SlideTileProps) {
  const label = String(index + 1).padStart(2, "0");
  const body = (
    <>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Canva CDN URLs, not optimizable
        <img src={url} alt={`スライド ${index + 1}`} />
      ) : (
        <span className="slide-tile-text">{variant === "card" ? headline : ""}</span>
      )}
      <span className="slide-tile-no">{label}</span>
    </>
  );
  const className = `slide-tile ${variant} ${url ? "has-image" : toneOf(index)}${active ? " active" : ""}`;
  if (!onSelect) return <div className={className}>{body}</div>;
  return (
    <button type="button" className={className} onClick={onSelect} aria-label={`スライド ${index + 1}`} aria-pressed={active}>
      {body}
    </button>
  );
}
