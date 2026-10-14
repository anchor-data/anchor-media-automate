"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { useWorkspace } from "../workspace-context";
import { SCHEDULE_OPTIONS } from "../../lib/mock-data";
import { Modal } from "./modal";

export function AddAccountModal() {
  const { closeModal, addAccount, notify } = useWorkspace();
  const [handle, setHandle] = useState("");
  const [schedule, setSchedule] = useState<string>(SCHEDULE_OPTIONS[0]);
  const [target, setTarget] = useState("");
  const [concept, setConcept] = useState("");
  const [title, setTitle] = useState("");
  const [connected, setConnected] = useState(false);

  const canSubmit = handle.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    addAccount(handle, schedule, target, concept, title);
    notify("アカウントを追加しました");
    closeModal();
  }

  return (
    <Modal
      title="アカウント追加"
      icon="plus"
      width={900}
      onClose={closeModal}
      footer={
        <>
          <button className="btn ghost" onClick={closeModal}>
            キャンセル
          </button>
          <button className="btn primary" disabled={!canSubmit} onClick={submit}>
            アカウントを追加
          </button>
        </>
      }
    >
      <div className="two-col">
        <div className="stack gap-16">
          <div className="tile">
            <span className="label">プラットフォーム連携</span>
            <button className="link-row" onClick={() => setConnected((v) => !v)}>
              <span className="row" style={{ gap: 8 }}>
                <Icon name="instagram" size={16} />
                {connected ? "Instagram 連携済み" : "Instagram アカウントを連携"}
              </span>
              <Icon name={connected ? "check" : "chevron-right"} size={14} />
            </button>
          </div>
          <div className="tile">
            <label className="label" htmlFor="acc-handle">
              アカウント名 / ID
            </label>
            <input
              id="acc-handle"
              className="input"
              placeholder="@username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
          </div>
          <div className="tile">
            <label className="label" htmlFor="acc-schedule">
              投稿生成スケジュール
            </label>
            <select
              id="acc-schedule"
              className="select"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            >
              {SCHEDULE_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="tile">
          <span className="label">初期企画エンジン設定</span>
          <p className="muted small" style={{ margin: 0, lineHeight: 1.5 }}>
            AIが投稿を作成するためのベースとなる情報です。後からでも変更可能です。
          </p>
          <label className="label" htmlFor="acc-target">
            ターゲット層
          </label>
          <input
            id="acc-target"
            className="input"
            placeholder="例: 20代のフリーランス"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <label className="label" htmlFor="acc-concept">
            ワンラインコンセプト
          </label>
          <input
            id="acc-concept"
            className="input"
            placeholder="例: 未経験からデザインを学ぶノウハウ"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
          />
          <label className="label" htmlFor="acc-title">
            アカウント一覧の表示タイトル
          </label>
          <input
            id="acc-title"
            className="input"
            placeholder="例: エンジニア転職"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
