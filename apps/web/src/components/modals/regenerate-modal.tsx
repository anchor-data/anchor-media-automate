"use client";

import { useState } from "react";
import { Modal } from "./modal";

interface RegenerateModalProps {
  title: string;
  description: string;
  /** When true an instruction is mandatory (e.g. a single-slide change needs to say what to change). */
  requireInstruction: boolean;
  onConfirm: (instruction: string) => void;
  onClose: () => void;
}

/** Confirm step before regenerating: the owner can say how the result should change. */
export function RegenerateModal({ title, description, requireInstruction, onConfirm, onClose }: RegenerateModalProps) {
  const [instruction, setInstruction] = useState("");
  const trimmed = instruction.trim();

  return (
    <Modal
      title={title}
      icon="sparkles"
      width={520}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn primary" disabled={requireInstruction && trimmed.length === 0} onClick={() => onConfirm(trimmed)}>
            再生成する
          </button>
        </>
      }
    >
      <div className="stack gap-8">
        <p className="muted small" style={{ margin: 0 }}>{description}</p>
        <label className="stack gap-4">
          <strong className="small">どのように変えたいですか{requireInstruction ? "" : "(任意)"}</strong>
          <textarea
            className="textarea"
            rows={4}
            maxLength={500}
            autoFocus
            placeholder="例: もっとカジュアルに。見出しは短く、数字を入れて"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </label>
        <p className="muted small" style={{ margin: 0 }}>空欄のまま実行すると、おまかせでもう一度生成します。</p>
      </div>
    </Modal>
  );
}
