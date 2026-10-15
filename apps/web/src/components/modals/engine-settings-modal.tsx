"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { useWorkspace } from "../workspace-context";
import { SCHEDULE_OPTIONS } from "../../lib/mock-data";
import { Modal } from "./modal";

export function EngineSettingsModal({ accountId }: { accountId: string }) {
  const {
    accounts,
    closeModal,
    notify,
    saveGuideline,
    references,
    memoryItems,
    ideas,
    addReference,
    removeReference,
    removeMemory,
    apiReady
  } = useWorkspace();
  const account = accounts.find((a) => a.id === accountId);
  const [title, setTitle] = useState(account?.title ?? "");
  const [target, setTarget] = useState(account?.target ?? "");
  const [concept, setConcept] = useState(account?.concept ?? "");
  const [schedule, setSchedule] = useState(account?.schedule ?? SCHEDULE_OPTIONS[0]);
  const [prompt, setPrompt] = useState(account?.systemPrompt ?? "");
  const [refTitle, setRefTitle] = useState("");
  const [refBody, setRefBody] = useState("");
  const [saving, setSaving] = useState(false);

  if (!account) return null;

  const queued = ideas.filter((i) => i.accountId === accountId && i.status === "queued");

  return (
    <Modal
      title={`${account.handle} エージェント設定`}
      icon="instagram"
      width={900}
      onClose={closeModal}
      footer={
        <>
          <button className="btn ghost" onClick={closeModal} disabled={saving}>
            キャンセル
          </button>
          <button
            className="btn primary"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void saveGuideline(account.id, {
                title: title.trim(),
                target: target.trim(),
                concept: concept.trim(),
                schedule,
                systemPrompt: prompt
              })
                .then(() => {
                  notify(apiReady ? "ガイドラインを保存しました" : "ローカルのみ保存しました");
                  closeModal();
                })
                .catch((error: unknown) => {
                  notify(error instanceof Error ? error.message : "保存に失敗しました");
                })
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "保存中…" : "設定を保存"}
          </button>
        </>
      }
    >
      <div className="two-col">
        <div className="stack gap-16">
          <div className="tile">
            <span className="label">ターゲット & コンセプト（ガイドライン）</span>
            <input
              className="input"
              aria-label="アカウント一覧の表示タイトル"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="アカウント一覧の表示タイトル"
            />
            <input
              className="input"
              aria-label="ターゲット"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <input
              className="input"
              aria-label="コンセプト"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
            />
          </div>
          <div className="tile stack gap-8">
            <span className="label">参照ライブラリ（人間が追加）</span>
            <input
              className="input"
              placeholder="参照タイトル"
              value={refTitle}
              onChange={(e) => setRefTitle(e.target.value)}
            />
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
                void addReference(account.id, refTitle.trim(), refBody.trim())
                  .then(() => {
                    setRefTitle("");
                    setRefBody("");
                    notify("参照を追加しました");
                  })
                  .catch((error: unknown) => {
                    notify(error instanceof Error ? error.message : "参照の追加に失敗");
                  });
              }}
            >
              <Icon name="upload" size={14} />
              参照を追加
            </button>
            <div className="stack gap-6">
              {references.length === 0 ? (
                <span className="muted small">参照はまだありません</span>
              ) : (
                references.map((ref) => (
                  <div className="queue-item" key={ref.id}>
                    <span className="stack gap-4" style={{ flex: 1 }}>
                      <strong style={{ fontSize: 12 }}>
                        [{ref.kind}] {ref.title}
                      </strong>
                      <span className="muted small">{ref.examplesText.slice(0, 80)}</span>
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
          <div className="tile">
            <span className="label">メモリーシステム (重複防止)</span>
            <div className="tags">
              {memoryItems.length === 0 ? (
                <span className="muted small">まだ記録がありません</span>
              ) : (
                memoryItems.map((m) => (
                  <button
                    type="button"
                    className="tag"
                    key={m.id}
                    title="クリックで削除"
                    onClick={() => {
                      void removeMemory(m.id).then(() => notify("メモリーを削除しました"));
                    }}
                  >
                    {m.topicKey}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="stack gap-16">
          <div className="tile">
            <span className="label">投稿生成スケジュール</span>
            <select
              className="select"
              aria-label="投稿生成スケジュール"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            >
              {SCHEDULE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.startsWith("毎日") ? `${option} に自動生成` : option}
                </option>
              ))}
            </select>
          </div>
          <div className="tile">
            <span className="label">システムプロンプト</span>
            <textarea
              className="textarea"
              rows={5}
              aria-label="システムプロンプト"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <div className="tile">
            <span className="label">生成されたアイデアキュー</span>
            {queued.length === 0 ? (
              <span className="muted small">キューは空です</span>
            ) : (
              queued.map((idea, i) => (
                <div className="queue-item" key={idea.id}>
                  {idea.title}
                  {i === 0 ? <Icon name="check" size={14} /> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
