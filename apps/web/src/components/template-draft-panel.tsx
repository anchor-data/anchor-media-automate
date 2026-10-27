"use client";

import { useState, type ChangeEvent } from "react";
import { createTemplateDraft, type TemplateDraft } from "../lib/api";
import { readAsDataUrl } from "../lib/read-file";

const MAX_SCREENSHOTS = 10;

interface TemplateDraftPanelProps {
  /** Called after the user says the template is published, so the picker can reload its list. */
  readonly onRefreshTemplates: () => void;
  readonly disabled?: boolean;
  /** Start expanded (the templates screen) instead of collapsed (inside the add-account modal). */
  readonly defaultOpen?: boolean;
}

function parseAssetUrls(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** New-account flow: reference Instagram + screenshots + assets → multi-page Canva draft. */
export function TemplateDraftPanel({ onRefreshTemplates, disabled, defaultOpen }: TemplateDraftPanelProps) {
  const [referenceUrl, setReferenceUrl] = useState("");
  const [assetText, setAssetText] = useState("");
  const [styleNotes, setStyleNotes] = useState("");
  const [screenshots, setScreenshots] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TemplateDraft | null>(null);
  const [copied, setCopied] = useState(false);

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_SCREENSHOTS);
    try {
      setScreenshots(await Promise.all(files.map(readAsDataUrl)));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "画像を読み込めませんでした");
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await createTemplateDraft({
          referenceUrl: referenceUrl.trim(),
          assetUrls: parseAssetUrls(assetText),
          styleNotes: styleNotes.trim(),
          screenshots: [...screenshots]
        })
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "テンプレートの下書きを作成できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function copyBrief() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.brief.markdown);
      setCopied(true);
    } catch {
      setError("クリップボードにコピーできませんでした");
    }
  }

  const canSubmit = referenceUrl.trim().length > 0 && !busy && !disabled;

  return (
    <details className="stack gap-8" open={defaultOpen || undefined}>
      <summary className="small">参考アカウントから新しいテンプレートを作成</summary>
      <label className="label" htmlFor="draft-ref">
        参考にするInstagramリンク
      </label>
      <input
        id="draft-ref"
        className="input"
        placeholder="https://www.instagram.com/username"
        value={referenceUrl}
        onChange={(e) => setReferenceUrl(e.target.value)}
      />
      <label className="label" htmlFor="draft-shots">
        参考カルーセルのスクリーンショット（順番通り・最大{MAX_SCREENSHOTS}枚）
      </label>
      <input id="draft-shots" type="file" accept="image/*" multiple onChange={(e) => void onFiles(e)} />
      <span className="muted small">
        {screenshots.length > 0
          ? `${screenshots.length}枚選択中。ページ数と文字枠を読み取ります`
          : "未選択の場合は標準の8ページで作成します"}
      </span>
      <label className="label" htmlFor="draft-assets">
        使いたい素材のURL（1行に1つ）
      </label>
      <textarea
        id="draft-assets"
        className="textarea"
        rows={3}
        value={assetText}
        onChange={(e) => setAssetText(e.target.value)}
      />
      <label className="label" htmlFor="draft-notes">
        スタイルのメモ
      </label>
      <input
        id="draft-notes"
        className="input"
        placeholder="例: 青を基調、角丸カード"
        value={styleNotes}
        onChange={(e) => setStyleNotes(e.target.value)}
      />
      <button className="btn outline" disabled={!canSubmit} onClick={() => void submit()}>
        {busy ? "作成中…" : "Canvaに下書きを作成"}
      </button>
      {error ? <span className="small">{error}</span> : null}
      {result ? (
        <div className="stack gap-8">
          <span className="small">
            {result.brief.pages.length}ページの下書きを作成しました。
            <a href={result.draft.editUrl} target="_blank" rel="noreferrer">
              Canvaで開く
            </a>
          </span>
          <span className="muted small">
            Canvaで各テキストにフィールド名を付け、ブランドテンプレートとして公開してください。
          </span>
          <button className="btn ghost" onClick={() => void copyBrief()}>
            {copied ? "コピーしました" : "手順とフィールド一覧をコピー"}
          </button>
          <button className="btn ghost" onClick={onRefreshTemplates}>
            公開したので一覧を更新
          </button>
        </div>
      ) : null}
    </details>
  );
}
