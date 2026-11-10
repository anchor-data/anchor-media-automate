"use client";

import { useState, type DragEvent } from "react";
import { MAX_SLIDES, MIN_SLIDES, SLIDE_ROLES, type SlideRole } from "@ama/shared";
import { Icon } from "../icon";
import { ROLE_LABEL } from "../../lib/slides";
import { structureIssues } from "./structure-issues";
import type { SavedReference } from "./use-account-design";

/** One page of the structure. The id is stable while the page is dragged around, so its images move with it. */
export interface BoardRow {
  readonly id: string;
  readonly role: SlideRole;
}

interface StructureBoardProps {
  rows: readonly BoardRow[];
  /** Reference screenshots; each belongs to the page (1-based) it names. */
  references?: readonly SavedReference[];
  onRowsChange: (next: BoardRow[]) => void;
  /** Leave out to hide the image attachment (a plain page list). */
  onAttach?: (files: File[], page: number) => void;
  onRemoveReference?: (name: string) => void;
  disabled?: boolean;
}

const THUMB = 64;
const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
const imageFiles = (files: FileList | File[]) => Array.from(files).filter((file) => file.type.startsWith("image/"));

/**
 * The pages of a post, in order, each with the reference screenshots that show how that page should
 * look. Drag a page by its handle to reorder (cover and closing page stay at the ends); drop or pick
 * images onto a page to attach them.
 */
export function StructureBoard({ rows, references = [], onRowsChange, onAttach, onRemoveReference, disabled = false }: StructureBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const last = rows.length - 1;
  const middleRoles = SLIDE_ROLES.filter((role) => role !== "cover" && role !== "cta");
  const issues = structureIssues(rows.map((row) => row.role));

  const move = (id: string, to: number) => {
    const from = rows.findIndex((row) => row.id === id);
    const target = Math.min(Math.max(to, 1), last - 1);
    if (from < 1 || from > last - 1 || from === target) return;
    const next = [...rows];
    const [item] = next.splice(from, 1);
    next.splice(target, 0, item!);
    onRowsChange(next);
  };

  const onDragOver = (event: DragEvent, index: number) => {
    if (disabled) return;
    if (dragId !== null) {
      if (index < 1 || index > last - 1) return;
      event.preventDefault();
      setOverIndex(index);
    } else if (onAttach && hasFiles(event)) {
      event.preventDefault();
      setOverIndex(index);
    }
  };

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    const id = dragId;
    setDragId(null);
    setOverIndex(null);
    if (disabled) return;
    if (id !== null) move(id, index);
    else if (hasFiles(event)) onAttach?.(imageFiles(event.dataTransfer.files), index + 1);
  };

  return (
    <div className="stack gap-8">
      <ol className="plain-list stack gap-8" style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {rows.map((row, index) => {
          const fixed = index === 0 || index === last;
          const images = references.filter((reference) => reference.page === index + 1);
          const over = overIndex === index;
          return (
            <li
              key={row.id}
              className="stack gap-4"
              style={{
                padding: 8,
                borderRadius: 10,
                border: `1px solid ${over ? "var(--accent, #2f4bbf)" : "var(--line, #e3e6ee)"}`,
                background: over ? "rgba(47, 75, 191, 0.06)" : dragId === row.id ? "var(--gray, #f3f4f7)" : undefined,
                opacity: dragId === row.id ? 0.6 : 1
              }}
              onDragOver={(event) => onDragOver(event, index)}
              onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
              onDrop={(event) => onDrop(event, index)}
            >
              <div className="row gap-8" style={{ alignItems: "center" }}>
                <span
                  draggable={!fixed && !disabled}
                  role="button"
                  aria-label={fixed ? "このページは動かせません" : `${index + 1}ページ目をドラッグして並べ替え`}
                  title={fixed ? "最初と最後のページは動かせません" : "ドラッグして並べ替え"}
                  className="muted"
                  style={{ display: "inline-grid", placeItems: "center", width: 24, height: 28, cursor: fixed || disabled ? "default" : "grab", opacity: fixed ? 0.25 : 1 }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", row.id);
                    const item = event.currentTarget.closest("li");
                    if (item) event.dataTransfer.setDragImage(item, 16, 16);
                    setDragId(row.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverIndex(null);
                  }}
                >
                  <Icon name="grip" size={16} />
                </span>
                <span className="muted small" style={{ width: 18, textAlign: "right" }}>{index + 1}</span>
                {fixed ? (
                  <strong style={{ flex: 1, whiteSpace: "nowrap" }}>{ROLE_LABEL[row.role]}</strong>
                ) : (
                  <select
                    className="select"
                    style={{ flex: 1, minWidth: 0 }}
                    aria-label={`${index + 1}ページ目の役割`}
                    disabled={disabled}
                    value={row.role}
                    onChange={(event) => onRowsChange(rows.map((r) => (r.id === row.id ? { ...r, role: event.target.value as SlideRole } : r)))}
                  >
                    {middleRoles.map((role) => (
                      <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                    ))}
                  </select>
                )}
                <button className="icon-btn" aria-label="このページを削除" disabled={disabled || fixed || rows.length <= MIN_SLIDES} onClick={() => onRowsChange(rows.filter((r) => r.id !== row.id))}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
              {onAttach ? (
              <div className="row gap-8" style={{ flexWrap: "wrap", alignItems: "center", paddingLeft: 32 }}>
                {images.map((image) => (
                  <span key={image.name} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
                    <img src={image.url} alt={`${index + 1}ページ目の参考画像`} width={THUMB} style={{ borderRadius: 6, display: "block" }} />
                    <button
                      className="icon-btn"
                      aria-label="この画像を外す"
                      disabled={disabled}
                      style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, background: "#fff", boxShadow: "0 0 0 1px var(--line-strong, #ccd)" }}
                      onClick={() => onRemoveReference?.(image.name)}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </span>
                ))}
                <label className="btn outline sm" style={{ cursor: disabled ? "default" : "pointer" }}>
                  <Icon name="image" size={12} />
                  {images.length > 0 ? "画像を追加" : "参考画像を添付"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    disabled={disabled}
                    onChange={(event) => {
                      const files = imageFiles(event.target.files ?? []);
                      event.target.value = "";
                      if (files.length > 0) onAttach?.(files, index + 1);
                    }}
                  />
                </label>
                {images.length === 0 ? <span className="muted small">このページの見た目の参考(ドロップでも添付できます)</span> : null}
              </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div className="row gap-8" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <span className="muted small">ページを追加:</span>
        {middleRoles.map((role) => (
          <button
            key={role}
            className="btn outline sm"
            disabled={disabled || rows.length >= MAX_SLIDES}
            // New pages go just before the CTA.
            onClick={() => onRowsChange([...rows.slice(0, last), { id: crypto.randomUUID(), role }, ...rows.slice(last)])}
          >
            + {ROLE_LABEL[role]}
          </button>
        ))}
        <span className="muted small">{rows.length}枚 / {MIN_SLIDES}〜{MAX_SLIDES}枚</span>
      </div>
      {issues.map((issue) => (
        <p key={issue} className="small" role="alert" style={{ margin: 0, color: "var(--danger, #c0392b)" }}>{issue}</p>
      ))}
    </div>
  );
}
