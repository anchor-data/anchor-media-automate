"use client";

import type { ChangeEvent } from "react";
import { Icon } from "../icon";
import { MAX_SCREENSHOTS, toScreenshot } from "../../lib/screenshots";

interface ScreenshotPickerProps {
  value: readonly string[];
  onChange: (next: readonly string[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

/** Reference screenshots (shrunk in the browser before they are sent). */
export function ScreenshotPicker({ value, onChange, onError, disabled = false }: ScreenshotPickerProps) {
  const add = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_SCREENSHOTS - value.length);
    event.target.value = "";
    try {
      const added = await Promise.all(files.map(toScreenshot));
      onChange([...value, ...added].slice(0, MAX_SCREENSHOTS));
    } catch (error) {
      onError(error instanceof Error ? error.message : "画像を追加できませんでした");
    }
  };

  return (
    <div className="row gap-8" style={{ flexWrap: "wrap" }}>
      {value.map((src, index) => (
        <span key={src.slice(-40) + index} style={{ position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
          <img src={src} alt={`参考 ${index + 1}`} width={72} style={{ borderRadius: 6, display: "block" }} />
          <button
            className="icon-btn"
            aria-label="この画像を外す"
            disabled={disabled}
            style={{ position: "absolute", top: -6, right: -6 }}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      {value.length < MAX_SCREENSHOTS ? (
        <label className="btn outline sm" style={{ cursor: disabled ? "default" : "pointer" }}>
          <Icon name="upload" size={12} />
          スクリーンショットを追加
          <input type="file" accept="image/*" multiple hidden disabled={disabled} onChange={(e) => void add(e)} />
        </label>
      ) : null}
    </div>
  );
}
