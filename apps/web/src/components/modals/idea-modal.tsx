"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EMPTY_CUSTOMIZATION, type PostCustomization } from "@ama/shared";
import { CustomizationForm, customizationIssues } from "../customization-form";
import { Icon } from "../icon";
import { useWorkspace } from "../workspace-context";
import type { IdeaCandidate } from "../../lib/mock-data";
import { Modal } from "./modal";

const SAMPLE_TEXT =
  "最近、フロントエンド界隈で話題になっている 'React Server Components' について、社内で議論がありました。\nこの技術のメリットとデメリットを、駆け出しエンジニア向けに分かりやすく解説するカルーセル投稿を作りたいです。";

export function IdeaModal() {
  const router = useRouter();
  const { closeModal, addDraftFromIdea, notify, generateIdeasFromApi, apiReady } = useWorkspace();
  const [text, setText] = useState(SAMPLE_TEXT);
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<readonly IdeaCandidate[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [customization, setCustomization] = useState<PostCustomization>(EMPTY_CUSTOMIZATION);

  const selected = ideas?.find((i) => i.id === selectedId) ?? null;

  if (ideas && customizing && selected) {
    const issues = customizationIssues(customization);
    return (
      <Modal
        title="生成前カスタマイズ"
        icon="sliders"
        width={640}
        onClose={closeModal}
        footer={
          <>
            <button className="btn ghost" onClick={() => setCustomizing(false)} disabled={busy}>
              戻る
            </button>
            <button
              className="btn primary"
              disabled={busy || issues.length > 0}
              onClick={() => {
                setBusy(true);
                void addDraftFromIdea(selected, customization)
                  .then((postId) => {
                    if (!postId) return;
                    notify(apiReady ? "コンテンツの生成を開始しました" : "下書きを作成しました（オフライン）");
                    closeModal();
                    router.push("/pipeline");
                  })
                  .finally(() => setBusy(false));
              }}
            >
              この内容で生成
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          「{selected.title}」への指示です。何も指定しなければ通常どおり生成されます。共通のデザインルールは別途「デザインルール」で設定します。
        </p>
        <CustomizationForm value={customization} onChange={setCustomization} disabled={busy} />
      </Modal>
    );
  }

  if (ideas) {
    return (
      <Modal
        title="企画案を選択"
        icon="sparkles"
        width={640}
        onClose={closeModal}
        footer={
          <>
            <button className="btn ghost" onClick={() => setIdeas(null)} disabled={busy}>
              戻る
            </button>
            <button
              className="btn primary"
              disabled={!selected || busy}
              onClick={() => setCustomizing(true)}
            >
              次へ: 生成前カスタマイズ
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          AIが{ideas.length}件の企画案を作成しました。投稿にしたい案を選んでください。
          {!apiReady ? "（オフラインモック）" : null}
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
          <button className="btn ghost" onClick={closeModal} disabled={busy}>
            キャンセル
          </button>
          <button
            className="btn primary"
            disabled={text.trim().length === 0 || busy}
            onClick={() => {
              setBusy(true);
              void generateIdeasFromApi({
                seedText: text,
                seedUrl: url.trim() || undefined
              })
                .then((items) => {
                  setIdeas(items);
                  setSelectedId(null);
                  notify("企画案を生成しました");
                })
                .catch((error: unknown) => {
                  notify(error instanceof Error ? error.message : "企画生成に失敗しました");
                })
                .finally(() => setBusy(false));
            }}
          >
            <Icon name="sparkles" size={14} />
            {busy ? "生成中…" : "AIで企画案を生成"}
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
