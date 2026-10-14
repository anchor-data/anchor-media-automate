"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { useWorkspace } from "../workspace-context";
import { SCHEDULE_OPTIONS } from "../../lib/mock-data";
import { Modal } from "./modal";

export function EngineSettingsModal({ accountId }: { accountId: string }) {
  const { accounts, closeModal, updateAccount, notify } = useWorkspace();
  const account = accounts.find((a) => a.id === accountId);
  const [target, setTarget] = useState(account?.target ?? "");
  const [concept, setConcept] = useState(account?.concept ?? "");
  const [schedule, setSchedule] = useState(account?.schedule ?? SCHEDULE_OPTIONS[0]);
  const [prompt, setPrompt] = useState(account?.systemPrompt ?? "");
  const [fileName, setFileName] = useState<string | null>(null);

  if (!account) return null;

  return (
    <Modal
      title={`${account.handle} 企画エンジン設定`}
      icon="instagram"
      width={900}
      onClose={closeModal}
      footer={
        <>
          <button className="btn ghost" onClick={closeModal}>
            キャンセル
          </button>
          <button
            className="btn primary"
            onClick={() => {
              updateAccount(account.id, {
                target: target.trim(),
                concept: concept.trim(),
                schedule,
                systemPrompt: prompt
              });
              notify("設定を保存しました");
              closeModal();
            }}
          >
            設定を保存
          </button>
        </>
      }
    >
      <div className="two-col">
        <div className="stack gap-16">
          <div className="tile">
            <span className="label">ターゲット & コンセプト</span>
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
          <div className="tile">
            <span className="label">自社データ・ドキュメント</span>
            <label className="dropzone" style={{ cursor: "pointer" }}>
              <Icon name="upload" size={16} />
              {fileName ?? "ファイルをアップロード"}
              <input
                type="file"
                hidden
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
          </div>
          <div className="tile">
            <span className="label">メモリーシステム (重複防止)</span>
            <div className="tags">
              {account.memory.length === 0 ? (
                <span className="muted small">まだ記録がありません</span>
              ) : (
                account.memory.map((m) => (
                  <span className="tag" key={m}>
                    {m}
                  </span>
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
            {account.ideaQueue.length === 0 ? (
              <span className="muted small">キューは空です</span>
            ) : (
              account.ideaQueue.map((idea, i) => (
                <div className="queue-item" key={idea}>
                  {idea}
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
