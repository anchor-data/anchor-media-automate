"use client";

import { useId } from "react";
import {
  IMAGE_MODES,
  MAX_HIGHLIGHT_KEYWORDS,
  SLIDE_PAGE_COUNT,
  postCustomizationSchema,
  type ImageMode,
  type PageToggle,
  type PostCustomization
} from "@ama/shared";

const IMAGE_MODE_LABEL: Record<ImageMode, string> = {
  auto: "自動 (AIが判断)",
  none: "画像を使わない",
  asset_only: "アップロード画像のみ"
};

const PAGES = Array.from({ length: SLIDE_PAGE_COUNT }, (_, index) => index + 1);

interface PageToggleFieldProps {
  label: string;
  hint?: string;
  value: PageToggle;
  disabled: boolean;
  onChange: (next: PageToggle) => void;
}

function PageToggleField({ label, hint, value, disabled, onChange }: PageToggleFieldProps) {
  return (
    <div className="row gap-8" style={{ alignItems: "center" }}>
      <label className="row gap-8 grow" style={{ alignItems: "center" }}>
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => onChange({ enabled: e.target.checked, page: e.target.checked ? value.page : null })}
        />
        <span>
          {label}
          {hint ? <span className="muted small"> {hint}</span> : null}
        </span>
      </label>
      <select
        className="input"
        style={{ width: 120 }}
        aria-label={`${label}のページ`}
        disabled={disabled || !value.enabled}
        value={value.page ?? ""}
        onChange={(e) => onChange({ ...value, page: e.target.value === "" ? null : Number(e.target.value) })}
      >
        <option value="">ページ指定なし</option>
        {PAGES.map((page) => (
          <option key={page} value={page}>
            {page}ページ目
          </option>
        ))}
      </select>
    </div>
  );
}

/** Problems the server would reject, shown inline so the user can fix them before generating. */
export function customizationIssues(value: PostCustomization): string[] {
  const parsed = postCustomizationSchema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

interface CustomizationFormProps {
  value: PostCustomization;
  onChange: (next: PostCustomization) => void;
  disabled?: boolean;
}

/** Per-post instructions entered before generation. Account-wide rules live on the design-rules tab. */
export function CustomizationForm({ value, onChange, disabled = false }: CustomizationFormProps) {
  const id = useId();
  const issues = customizationIssues(value);
  const set = (patch: Partial<PostCustomization>) => onChange({ ...value, ...patch });

  return (
    <div className="stack gap-12">
      <div className="stack gap-4">
        <label className="label" htmlFor={`${id}-keywords`}>
          強調したいキーワード (カンマ区切り・最大{MAX_HIGHLIGHT_KEYWORDS}個)
        </label>
        <input
          id={`${id}-keywords`}
          className="input"
          disabled={disabled}
          placeholder="例: 年収, 副業"
          defaultValue={value.highlightKeywords.join(", ")}
          onChange={(e) => set({ highlightKeywords: e.target.value.split(/[,、，]/).map((word) => word.trim()).filter(Boolean) })}
        />
      </div>

      <PageToggleField label="グラフを入れる" hint="(AI画像生成が必要)" value={value.graph} disabled={disabled} onChange={(graph) => set({ graph })} />
      <PageToggleField label="エビデンスを入れる" hint="(出典・数字)" value={value.evidence} disabled={disabled} onChange={(evidence) => set({ evidence })} />

      <div className="stack gap-4">
        <label className="label" htmlFor={`${id}-image-mode`}>
          画像の使い方
        </label>
        <select
          id={`${id}-image-mode`}
          className="input"
          disabled={disabled}
          value={value.imageMode}
          onChange={(e) => set({ imageMode: e.target.value as ImageMode })}
        >
          {IMAGE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {IMAGE_MODE_LABEL[mode]}
            </option>
          ))}
        </select>
      </div>

      <div className="stack gap-4">
        <label className="label" htmlFor={`${id}-seed`}>
          バリエーション・シード (任意)
        </label>
        <div className="row gap-8">
          <input
            id={`${id}-seed`}
            className="input grow"
            disabled={disabled}
            placeholder="変えると構成・言い回しが変わります"
            value={value.variationSeed ?? ""}
            onChange={(e) => set({ variationSeed: e.target.value === "" ? null : e.target.value })}
          />
          <button
            type="button"
            className="btn outline sm"
            disabled={disabled}
            onClick={() => set({ variationSeed: Math.random().toString(36).slice(2, 8) })}
          >
            ランダム
          </button>
        </div>
      </div>

      <div className="stack gap-4">
        <label className="label" htmlFor={`${id}-notes`}>
          補足指示 (自由文)
        </label>
        <textarea
          id={`${id}-notes`}
          className="textarea"
          rows={3}
          maxLength={500}
          disabled={disabled}
          placeholder="例: 2ページ目は共感を強めに / 数字を大きく見せたい"
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>

      {issues.map((issue) => (
        <p key={issue} className="small" role="alert" style={{ color: "var(--danger, #c0392b)", margin: 0 }}>
          {issue}
        </p>
      ))}
    </div>
  );
}
