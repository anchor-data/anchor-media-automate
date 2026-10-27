"use client";

import { useState, type ChangeEvent } from "react";
import type { MemoryItem, Reference } from "@ama/shared";
import { Icon } from "../icon";
import { PageTopbar, Tabs } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { readAsDataUrl } from "../../lib/read-file";
import { formatMonthDay } from "../../lib/schedule";

type GuidelineTab = "references" | "memory";

const MAX_SCREENSHOTS = 10;

const MEMORY_LABEL: Record<MemoryItem["kind"], string> = {
  topic_used: "topic_used",
  hook_used: "hook_used",
  idea_rejected: "idea_rejected",
  editor_feedback: "editor_feedback",
  preference: "preference"
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function ReferenceRows({ items, compact, onRemove }: { items: readonly Reference[]; compact: boolean; onRemove: (r: Reference) => void }) {
  if (items.length === 0) return <p className="empty small">参照資料はまだありません</p>;
  return (
    <ul className="plain-list">
      {items.map((ref) => (
        <li className="ref-row" key={ref.id}>
          <div className="stack gap-2 grow">
            <strong>{ref.title}</strong>
            <span className="muted small">
              {ref.kind} · 更新 {formatMonthDay(ref.updatedAt)}
            </span>
            {compact ? null : <span className="small ref-body">{ref.examplesText.slice(0, 300)}</span>}
          </div>
          <button className="icon-btn" aria-label="参照を削除" onClick={() => onRemove(ref)}>
            <Icon name="x" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function MemoryRows({ items, compact, onRemove }: { items: readonly MemoryItem[]; compact: boolean; onRemove: (m: MemoryItem) => void }) {
  if (items.length === 0) return <p className="empty small">まだ記録がありません</p>;
  const shown = compact ? items.slice(0, 6) : items;
  return (
    <ul className="plain-list">
      {shown.map((item) => (
        <li className="mem-row" key={item.id}>
          <span className={`mem-kind${item.kind === "idea_rejected" ? " warn" : ""}`}>{MEMORY_LABEL[item.kind]}</span>
          <span className="grow small">{item.topicKey}</span>
          <span className="muted small">{formatMonthDay(item.createdAt)}</span>
          <button className="icon-btn" aria-label="メモリを削除" onClick={() => onRemove(item)}>
            <Icon name="x" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function GuidelinesPage() {
  const {
    references,
    memoryItems,
    activeAccountId,
    apiReady,
    addReference,
    uploadReference,
    importInstagramReference,
    removeReference,
    removeMemory,
    notify
  } = useWorkspace();
  const [tab, setTab] = useState<GuidelineTab>("references");
  const [adding, setAdding] = useState(false);
  const [refTitle, setRefTitle] = useState("");
  const [refBody, setRefBody] = useState("");
  const [igUrl, setIgUrl] = useState("");
  const [screenshots, setScreenshots] = useState<readonly string[]>([]);
  const [importing, setImporting] = useState(false);

  const onScreenshots = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_SCREENSHOTS);
    event.target.value = "";
    try {
      setScreenshots(await Promise.all(files.map(readAsDataUrl)));
    } catch (error) {
      notify(errorText(error, "画像を読み込めませんでした"));
    }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const count = await importInstagramReference(activeAccountId, igUrl.trim(), [...screenshots]);
      notify(`Instagramから ${count} 件の参照を追加しました`);
      setIgUrl("");
      setScreenshots([]);
    } catch (error) {
      notify(errorText(error, "インポートに失敗しました"));
    } finally {
      setImporting(false);
    }
  };

  const submitReference = () =>
    addReference(activeAccountId, refTitle.trim(), refBody.trim())
      .then(() => {
        setRefTitle("");
        setRefBody("");
        setAdding(false);
        notify("参照を追加しました");
      })
      .catch((error: unknown) => notify(errorText(error, "参照の追加に失敗")));

  const dropReference = (ref: Reference) =>
    void removeReference(ref.id)
      .then(() => notify("参照を削除しました"))
      .catch((error: unknown) => notify(errorText(error, "削除に失敗しました")));
  const dropMemory = (item: MemoryItem) =>
    void removeMemory(item.id)
      .then(() => notify("メモリーを削除しました"))
      .catch((error: unknown) => notify(errorText(error, "削除に失敗しました")));

  return (
    <>
      <PageTopbar title="参照資料・メモリ" />
      <div className="split">
        <section className="pane grow pad-32">
          <Tabs
            label="ガイドライン"
            value={tab}
            onChange={setTab}
            options={[
              { id: "references", label: `参照資料 ${references.length}` },
              { id: "memory", label: `メモリ ${memoryItems.length}` }
            ]}
          />
          {tab === "references" ? (
            <div className="pad-t-16">
              <ReferenceRows items={references} compact={false} onRemove={dropReference} />
            </div>
          ) : null}
          {tab === "memory" ? (
            <div className="pad-t-16">
              <MemoryRows items={memoryItems} compact={false} onRemove={dropMemory} />
            </div>
          ) : null}
        </section>

        <aside className="pane side-pane wide">
          <div className="row between">
            <h3 className="pane-title">参照資料</h3>
            <button className="link small" disabled={!apiReady} onClick={() => setAdding((v) => !v)}>
              {adding ? "閉じる" : "+ 追加"}
            </button>
          </div>
          {adding ? (
            <div className="note-box stack gap-8">
              <input className="input" placeholder="参照タイトル" value={refTitle} onChange={(e) => setRefTitle(e.target.value)} />
              <textarea className="textarea" rows={3} placeholder="参考テキスト・構造メモ" value={refBody} onChange={(e) => setRefBody(e.target.value)} />
              <button className="btn primary sm" disabled={!refTitle.trim()} onClick={() => void submitReference()}>
                参照を追加
              </button>
            </div>
          ) : null}
          <ReferenceRows items={references.slice(0, 4)} compact onRemove={dropReference} />
          <div className="row between pad-t-16">
            <h3 className="pane-title">メモリ(エージェントの記憶)</h3>
            <span className="muted small">{memoryItems.length}件</span>
          </div>
          <MemoryRows items={memoryItems} compact onRemove={dropMemory} />
          <p className="muted small">承認・却下の結果は自動でメモリに書き込まれ、次回のアイデア提案から重複を避けます。</p>
          <div className="note-box stack gap-8">
            <strong>Instagramの参照アカウントから追加</strong>
            <input
              className="input"
              placeholder="@handle または instagram.com/handle"
              value={igUrl}
              onChange={(e) => setIgUrl(e.target.value)}
            />
            <label className="btn outline sm">
              <Icon name="upload" size={12} />
              スクリーンショット(最大{MAX_SCREENSHOTS}枚){screenshots.length > 0 ? ` — ${screenshots.length}枚` : ""}
              <input type="file" accept="image/*" multiple hidden onChange={(e) => void onScreenshots(e)} />
            </label>
            <div className="row gap-8">
              <button
                className="btn primary sm grow"
                disabled={!apiReady || importing || !igUrl.trim() || screenshots.length === 0}
                onClick={() => void runImport()}
              >
                {importing ? "抽出中…" : "抽出して参照に追加"}
              </button>
              <label className="btn outline sm">
                ファイル追加 (.txt/.md)
                <input
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  hidden
                  disabled={!apiReady}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    void uploadReference(activeAccountId, file)
                      .then(({ truncated }) => notify(truncated ? "参照を追加しました(長いため一部のみ)" : "参照を追加しました"))
                      .catch((error: unknown) => notify(errorText(error, "アップロードに失敗")));
                  }}
                />
              </label>
            </div>
            <p className="muted small">原文はコピーせず、フック・構成・トーンを言い換えて抽出します。</p>
          </div>
        </aside>
      </div>
    </>
  );
}
