"use client";

import { MAX_SLIDES, MIN_SLIDES, SLIDE_ROLES, deckStructureSchema, type SlideRole } from "@ama/shared";
import { Icon } from "../icon";
import { ROLE_LABEL } from "../../lib/slides";

const ROLE_HINT: Record<SlideRole, string> = {
  cover: "タイトル",
  empathy: "悩みへの共感",
  point: "ノウハウの要点",
  pick: "求人 / まとめ",
  cta: "フォロー・保存を促す"
};

interface StructureEditorProps {
  value: readonly SlideRole[];
  onChange: (next: SlideRole[]) => void;
  disabled?: boolean;
}

/** Problems with a structure, in Japanese (empty when it is valid). */
export function structureIssues(value: readonly SlideRole[]): string[] {
  const parsed = deckStructureSchema.safeParse(value);
  if (parsed.success) return [];
  return [...new Set(parsed.error.issues.map((issue) => issue.message))].map((message) =>
    message.includes("Too small") || message.includes("Too big") ? `ページ数は${MIN_SLIDES}〜${MAX_SLIDES}枚にしてください` : message
  );
}

/** Edit the account's page structure: change a page's role, reorder, add, remove. Cover and CTA stay at the ends. */
export function StructureEditor({ value, onChange, disabled = false }: StructureEditorProps) {
  const last = value.length - 1;
  const set = (index: number, role: SlideRole) => onChange(value.map((r, i) => (i === index ? role : r)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...value];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    onChange(next);
  };
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  // New pages go just before the CTA.
  const add = (role: SlideRole) => onChange([...value.slice(0, last), role, ...value.slice(last)]);
  const issues = structureIssues(value);
  const middleRoles = SLIDE_ROLES.filter((role) => role !== "cover" && role !== "cta");

  return (
    <div className="stack gap-8">
      <ol className="plain-list stack gap-4" style={{ margin: 0 }}>
        {value.map((role, index) => {
          const fixed = index === 0 || index === last;
          return (
            <li key={`${index}-${role}`} className="row gap-8" style={{ alignItems: "center" }} title={ROLE_HINT[role]}>
              <span className="muted small" style={{ width: 22, textAlign: "right" }}>{index + 1}</span>
              {fixed ? (
                <strong style={{ flex: 1, whiteSpace: "nowrap" }}>{ROLE_LABEL[role]}</strong>
              ) : (
                <select className="select" style={{ flex: 1, minWidth: 0 }} aria-label={`${index + 1}ページ目の役割`} disabled={disabled} value={role} onChange={(e) => set(index, e.target.value as SlideRole)}>
                  {middleRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              )}
                            <button className="icon-btn" aria-label="上へ" disabled={disabled || fixed || index === 1} onClick={() => move(index, -1)}>
                <Icon name="chevron-up" size={12} />
              </button>
              <button className="icon-btn" aria-label="下へ" disabled={disabled || fixed || index === last - 1} onClick={() => move(index, 1)}>
                <Icon name="chevron-down" size={12} />
              </button>
              <button className="icon-btn" aria-label="このページを削除" disabled={disabled || fixed} onClick={() => remove(index)}>
                <Icon name="trash" size={12} />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="row gap-8" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <span className="muted small">ページを追加:</span>
        {middleRoles.map((role) => (
          <button key={role} className="btn outline sm" disabled={disabled || value.length >= MAX_SLIDES} onClick={() => add(role)}>
            + {ROLE_LABEL[role]}
          </button>
        ))}
        <span className="muted small">{value.length}枚 / {MIN_SLIDES}〜{MAX_SLIDES}枚</span>
      </div>
      {issues.map((issue) => (
        <p key={issue} className="small" role="alert" style={{ margin: 0, color: "var(--danger, #c0392b)" }}>{issue}</p>
      ))}
    </div>
  );
}
