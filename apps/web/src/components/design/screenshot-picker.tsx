"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Icon } from "../icon";
import { MAX_SCREENSHOTS, toScreenshot } from "../../lib/screenshots";

interface ScreenshotPickerProps {
  value: readonly string[];
  onChange: (next: readonly string[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  /** Page of the carousel each screenshot shows (0 = not said), same order as `value`. Give both to show the page choice. */
  pages?: readonly number[];
  onPagesChange?: (next: readonly number[]) => void;
  pageOptions?: ReadonlyArray<{ value: number; label: string }>;
}

function imageFiles(files: Iterable<File>): File[] {
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}

/** Reference screenshots (shrunk in the browser before they are sent). Add by picking, dropping or pasting. */
export function ScreenshotPicker({ value, onChange, onError, disabled = false, pages, onPagesChange, pageOptions = [] }: ScreenshotPickerProps) {
  const [dragging, setDragging] = useState(false);
  // Paste and drop can fire faster than React re-renders, so always append to the latest list.
  const latest = useRef(value);
  latest.current = value;
  const latestPages = useRef(pages ?? []);
  latestPages.current = pages ?? [];

  const addFiles = useCallback(
    async (files: File[]) => {
      const room = MAX_SCREENSHOTS - latest.current.length;
      if (disabled || files.length === 0) return;
      if (room <= 0) {
        onError(`画像は最大${MAX_SCREENSHOTS}枚までです`);
        return;
      }
      try {
        const added = await Promise.all(files.slice(0, room).map(toScreenshot));
        const next = [...latest.current, ...added].slice(0, MAX_SCREENSHOTS);
        latest.current = next;
        onChange(next);
        if (onPagesChange) {
          // Keep one page entry per screenshot; new ones start without a page.
          const nextPages = Array.from({ length: next.length }, (_, i) => latestPages.current[i] ?? 0);
          latestPages.current = nextPages;
          onPagesChange(nextPages);
        }
        if (files.length > room) onError(`画像は最大${MAX_SCREENSHOTS}枚までのため、${room}枚だけ追加しました`);
      } catch (error) {
        onError(error instanceof Error ? error.message : "画像を追加できませんでした");
      }
    },
    [disabled, onChange, onError, onPagesChange]
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = imageFiles(
        Array.from(event.clipboardData?.items ?? [])
          .filter((item) => item.kind === "file")
          .flatMap((item) => item.getAsFile() ?? [])
      );
      if (files.length === 0) return; // plain text pastes behave as usual
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = imageFiles(event.target.files ?? []);
    event.target.value = "";
    void addFiles(files);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(imageFiles(Array.from(event.dataTransfer.files)));
  };

  return (
    <div
      className="row gap-8"
      style={{
        flexWrap: "wrap",
        padding: 8,
        borderRadius: 10,
        border: `1px dashed ${dragging ? "var(--accent, #2f4bbf)" : "var(--border, #d5d9e2)"}`,
        background: dragging ? "rgba(47, 75, 191, 0.06)" : undefined
      }}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      {value.map((src, index) => (
        <span key={src.slice(-40) + index} className="stack gap-4" style={{ position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
          <img src={src} alt={`参考 ${index + 1}`} width={72} style={{ borderRadius: 6, display: "block" }} />
          <button
            className="icon-btn"
            aria-label="この画像を外す"
            disabled={disabled}
            style={{ position: "absolute", top: -6, right: -6 }}
            onClick={() => {
              onChange(value.filter((_, i) => i !== index));
              onPagesChange?.((pages ?? []).filter((_, i) => i !== index));
            }}
          >
            <Icon name="x" size={12} />
          </button>
          {onPagesChange ? (
            <PageSelect
              value={pages?.[index] ?? 0}
              options={pageOptions}
              disabled={disabled}
              onChange={(page) => onPagesChange(value.map((_, i) => (i === index ? page : (pages?.[i] ?? 0))))}
            />
          ) : null}
        </span>
      ))}
      {value.length < MAX_SCREENSHOTS ? (
        <label className="btn outline sm" style={{ cursor: disabled ? "default" : "pointer" }}>
          <Icon name="upload" size={12} />
          スクリーンショットを追加
          <input type="file" accept="image/*" multiple hidden disabled={disabled} onChange={pick} />
        </label>
      ) : null}
      <span className="muted small" style={{ alignSelf: "center" }}>
        ここにドラッグ&ドロップ、または貼り付け(⌘V / Ctrl+V)でもまとめて追加できます
      </span>
    </div>
  );
}

/** "Which page is this?" choice under a reference screenshot. */
export function PageSelect({
  value,
  options,
  onChange,
  disabled = false
}: {
  value: number;
  options: ReadonlyArray<{ value: number; label: string }>;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="input"
      aria-label="この画像が何ページ目か"
      value={value}
      disabled={disabled}
      style={{ width: 96, padding: "2px 4px", fontSize: 12 }}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      <option value={0}>ページ指定なし</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
