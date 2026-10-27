"use client";

import { useState } from "react";

interface SlideCarouselProps {
  readonly urls: readonly string[];
}

/** Page-through preview of a rendered post's slide images. */
export function SlideCarousel({ urls }: SlideCarouselProps) {
  const [index, setIndex] = useState(0);
  const current = Math.min(index, urls.length - 1);
  return (
    <div className="stack gap-8">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed Canva CDN URLs, not optimizable */}
      <img className="slide-preview" src={urls[current]} alt={`スライド ${current + 1}`} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn ghost" disabled={current === 0} onClick={() => setIndex(current - 1)}>
          前へ
        </button>
        <span className="small muted">
          {current + 1} / {urls.length}
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={current === urls.length - 1}
          onClick={() => setIndex(current + 1)}
        >
          次へ
        </button>
      </div>
    </div>
  );
}
