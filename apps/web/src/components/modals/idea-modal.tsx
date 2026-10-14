"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { useWorkspace } from "../workspace-context";
import { generateIdeas, type IdeaCandidate } from "../../lib/mock-data";
import { Modal } from "./modal";

const SAMPLE_TEXT =
  "最近、フロントエンド界隈で話題になっている 'React Server Components' について、社内で議論がありました。\nこの技術のメリットとデメリットを、駆け出しエンジニア向けに分かりやすく解説するカルーセル投稿を作りたいです。";

export function IdeaModal() {
  const { closeModal, addDraftFromIdea, notify } = useWorkspace();
  const [text, setText] = useState(SAMPLE_TEXT);
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<readonly IdeaCandidate[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = ideas?.find((i) => i.id === selectedId) ?? null;

  if (ideas) {
    return (
      <Modal
        title="企画案を選択"
        icon="sparkles"
        width={640}
        onClose={closeModal}
        footer={
          <>
            <button className="btn ghost" onClick={() => setIdeas(null)}>
              戻る
            </button>
            <button
              className="btn primary"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                addDraftFromIdea(selected);
                notify("下書きを作成しました");
                closeModal();
              }}
            >
              この企画で投稿を生成
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          AIが3件の企画案を作成しました。投稿にしたい案を選んでください。
        </p>
        {ideas.map((idea) => (
          <button
            key={idea.id}
            className={`idea-option${idea.id === selectedId ? " selected" : ""}`}
            onClick={() => setSelectedId(idea.id)}
          >
            <span className="check">
              {idea.id === selectedId ? <Icon name="check" size={12} /> : null}
            </span>
            <span className="stack gap-4">
              <strong style={{ fontSize: 13 }}>{idea.title}</strong>
              <span className="muted small" style={{ lineHeight: 1.5 }}>
                {idea.summary}
              </span>
            </span>
          </button>
        ))}
      </Modal>
    );
  }

  return (
    <Modal
      title="カスタム企画の入力"
      icon="pen-tool"
      width={640}
      onClose={closeModal}
      footer={
        <>
          <button className="btn ghost" onClick={closeModal}>
            キャンセル
          </button>
          <button
            className="btn primary"
            disabled={text.trim().length === 0}
            onClick={() => {
              setIdeas(generateIdeas(text));
              setSelectedId(null);
            }}
          >
            <Icon name="sparkles" size={14} />
            AIで企画案を生成
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
        AIにどのような投稿を作ってほしいですか？
        <br />
        思いついたアイデア、意見、または参考になるテキストを自由に入力してください。
      </p>
      <div className="stack gap-8">
        <label className="label" htmlFor="idea-text">
          自分の意見・参考テキスト
        </label>
        <textarea
          id="idea-text"
          className="textarea"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="two-col">
        <label className="link-row">
          <Icon name="link" size={14} />
          <input
            className="input"
            style={{ border: 0, padding: 0, background: "none" }}
            placeholder="参考URL (オプション)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="link-row" style={{ cursor: "pointer" }}>
          <Icon name="paperclip" size={14} />
          <span className="muted" style={{ flex: 1 }}>
            {fileName ?? "ファイルを添付"}
          </span>
          <input
            type="file"
            hidden
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </div>
    </Modal>
  );
}
