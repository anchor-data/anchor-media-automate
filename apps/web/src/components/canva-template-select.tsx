"use client";

import { useEffect, useState } from "react";
import { listBrandTemplates, type BrandTemplate } from "../lib/api";

interface CanvaTemplateSelectProps {
  readonly value: string;
  readonly onChange: (templateId: string) => void;
  readonly disabled?: boolean;
}

/** Brand templates the connected Canva account can see. Needs `canva:bootstrap` to have run. */
export function CanvaTemplateSelect({ value, onChange, disabled }: CanvaTemplateSelectProps) {
  const [templates, setTemplates] = useState<readonly BrandTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBrandTemplates()
      .then((res) => {
        if (!cancelled) setTemplates(res.items);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "テンプレートを取得できませんでした");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <span className="small muted">テンプレート一覧を取得できません（Canva連携を確認）: {error}</span>;
  }
  if (!templates) return <span className="small muted">読み込み中…</span>;

  const known = templates.some((t) => t.id === value);
  return (
    <select
      className="select"
      aria-label="Canvaテンプレート"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {value === "" ? <option value="">テンプレートを選択…</option> : null}
      {value !== "" && !known ? <option value={value}>現在: {value}（一覧にありません）</option> : null}
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title}
        </option>
      ))}
    </select>
  );
}
