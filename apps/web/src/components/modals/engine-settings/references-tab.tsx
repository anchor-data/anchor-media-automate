"use client";

import { useState, type ChangeEvent } from "react";
import { readAsDataUrl } from "../../../lib/read-file";
import { Icon } from "../../icon";
import { useWorkspace } from "../../workspace-context";

const MAX_SCREENSHOTS = 10;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Reference library: import from an Instagram account, add text or files, review and delete. */
export function ReferencesTab({ accountId }: { readonly accountId: string }) {
  const { references, notify, addReference, uploadReference, importInstagramReference, removeReference } =
    useWorkspace();
  const [igUrl, setIgUrl] = useState("");
  const [screenshots, setScreenshots] = useState<readonly string[]>([]);
  const [importing, setImporting] = useState(false);
  const [refTitle, setRefTitle] = useState("");
  const [refBody, setRefBody] = useState("");

  async function onScreenshots(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_SCREENSHOTS);
    event.target.value = "";
    try {
      setScreenshots(await Promise.all(files.map(readAsDataUrl)));
    } catch (error) {
      notify(errorText(error, "画像を読み込めませんでした"));
    }
  }

  async function runImport() {
    setImporting(true);
    try {
      const count = await importInstagramReference(accountId, igUrl.trim(), [...screenshots]);
      notify(`Instagramから ${count} 件の参照を追加しました`);
      setIgUrl("");
      setScreenshots([]);
    } catch (error) {
      notify(errorText(error, "インポートに失敗しました"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="stack gap-16">
      <div className="tile stack gap-8">
        <span className="label">Instagramの参照アカウントから追加</span>
        <span className="muted small">
          参照アカウントの投稿スクリーンショットから、フック・スライド構成・トーンを言い換えて抽出し、下のリストに追加します（原文はコピーしません）。
        </span>
        <input
          className="input"
          placeholder="@handle または instagram.com/handle"
          value={igUrl}
          onChange={(e) => setIgUrl(e.target.value)}
        />
        <label className="btn outline">
          <Icon name="upload" size={14} />
          スクリーンショットを選択（最大{MAX_SCREENSHOTS}枚）{screenshots.length > 0 ? ` — ${screenshots.length}枚選択中` : ""}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => void onScreenshots(e)} />
        </label>
        <button
          className="btn primary"
          type="button"
          disabled={importing || !igUrl.trim() || screenshots.length === 0}
          onClick={() => void runImport()}
        >
          {importing ? "抽出中…" : "抽出して参照に追加"}
        </button>
      </div>

      <div className="tile stack gap-8">
        <span className="label">テキスト・ファイルから追加</span>
        <input className="input" placeholder="参照タイトル" value={refTitle} onChange={(e) => setRefTitle(e.target.value)} />
        <textarea
          className="textarea"
          rows={3}
          placeholder="参考テキスト・構造メモ"
          value={refBody}
          onChange={(e) => setRefBody(e.target.value)}
        />
        <button
          className="btn outline"
          type="button"
          disabled={!refTitle.trim()}
          onClick={() => {
            void addReference(accountId, refTitle.trim(), refBody.trim())
              .then(() => {
                setRefTitle("");
                setRefBody("");
                notify("参照を追加しました");
              })
              .catch((error: unknown) => notify(errorText(error, "参照の追加に失敗")));
          }}
        >
          <Icon name="upload" size={14} />
          参照を追加
        </button>
        <label className="btn outline">
          <Icon name="upload" size={14} />
          ファイルをアップロード (.txt / .md)
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void uploadReference(accountId, file)
                .then(({ truncated }) =>
                  notify(truncated ? "参照を追加しました（長いため一部のみ）" : "参照を追加しました")
                )
                .catch((error: unknown) => notify(errorText(error, "アップロードに失敗")));
            }}
          />
        </label>
      </div>

      <div className="tile stack gap-8">
        <span className="label">登録済みの参照（{references.length}）</span>
        {references.length === 0 ? (
          <span className="muted small">参照はまだありません</span>
        ) : (
          references.map((ref) => (
            <div className="queue-item" key={ref.id}>
              <span className="stack gap-4" style={{ flex: 1 }}>
                <strong style={{ fontSize: 12 }}>
                  [{ref.kind}] {ref.title}
                </strong>
                <span className="muted small">{ref.examplesText.slice(0, 120)}</span>
                {ref.sourceNote ? <span className="muted small">{ref.sourceNote}</span> : null}
              </span>
              <button
                type="button"
                className="btn ghost"
                aria-label="参照を削除"
                onClick={() => {
                  void removeReference(ref.id).then(() => notify("参照を削除しました"));
                }}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
