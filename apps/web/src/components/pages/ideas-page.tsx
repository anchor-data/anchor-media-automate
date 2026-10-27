"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Idea } from "@ama/shared";
import { PageTopbar } from "../ui/page";
import { Icon } from "../icon";
import { useWorkspace } from "../workspace-context";
import { SLIDES } from "../../lib/slides";

const STATUS_LABEL: Record<Idea["status"], string> = {
  queued: "提案",
  selected: "採用済み",
  used: "使用済み",
  rejected: "却下"
};

const STATUS_RANK: Record<Idea["status"], number> = { queued: 0, selected: 1, used: 2, rejected: 3 };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "不明なエラー";
}

export function IdeasPage() {
  const router = useRouter();
  const {
    ideas,
    memoryItems,
    references,
    activeAccountId,
    selectedIdeaId,
    selectIdea,
    openModal,
    generateIdeasFromApi,
    addDraftFromIdea,
    rejectIdea,
    notify,
    apiReady
  } = useWorkspace();
  const [suggesting, setSuggesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const accountIdeas = useMemo(
    () =>
      ideas
        .filter((i) => i.accountId === activeAccountId)
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.createdAt.localeCompare(a.createdAt)),
    [ideas, activeAccountId]
  );
  const selected = accountIdeas.find((i) => i.id === selectedIdeaId) ?? accountIdeas[0] ?? null;

  const usedTopics = new Set(memoryItems.filter((m) => m.kind === "topic_used").map((m) => m.topicKey));
  const isDuplicate = (idea: Idea) => idea.status === "queued" && usedTopics.has(idea.topicKey);

  const suggest = async () => {
    setSuggesting(true);
    try {
      const made = await generateIdeasFromApi({ count: 10 });
      notify(`${made.length}件の企画を提案しました`);
    } catch (error) {
      notify(errorText(error));
    } finally {
      setSuggesting(false);
    }
  };

  const generate = async (idea: Idea) => {
    setStarting(true);
    const postId = await addDraftFromIdea({ id: idea.id, title: idea.title, summary: idea.summary });
    setStarting(false);
    if (postId) {
      notify("コンテンツの生成を開始しました");
      router.push("/pipeline");
    }
  };

  const reject = async (idea: Idea) => {
    try {
      await rejectIdea(idea.id, reason.trim() || `Rejected: ${idea.title}`);
      notify("企画を却下しました");
      setRejecting(false);
      setReason("");
    } catch (error) {
      notify(errorText(error));
    }
  };

  const referenceTitles = selected
    ? selected.referenceIds
        .map((id) => references.find((r) => r.id === id)?.title)
        .filter((title): title is string => Boolean(title))
    : [];

  return (
    <>
      <PageTopbar title="アイデア">
        <button className="btn outline" onClick={() => openModal({ kind: "idea" })}>
          手動で企画を入力
        </button>
        <button className="btn primary" disabled={!apiReady || suggesting} onClick={() => void suggest()}>
          <Icon name="sparkles" size={14} />
          {suggesting ? "提案中…" : "AIで10件提案させる"}
        </button>
      </PageTopbar>
      <div className="split">
        <section className="pane grow pad-32">
          <div className="page-head tight">
            <div>
              <h1>企画キュー</h1>
              <p className="muted small">ガイドライン・過去投稿・メモリを踏まえてエージェントが提案した企画です</p>
            </div>
          </div>
          {accountIdeas.length === 0 ? (
            <p className="empty">企画はまだありません。「AIで10件提案させる」から作成できます。</p>
          ) : (
            <div className="table">
              <div className="trow head cols-ideas">
                <span>企画 / フック案</span>
                <span>重複チェック</span>
                <span>状態</span>
              </div>
              {accountIdeas.map((idea) => {
                return (
                  <button
                    key={idea.id}
                    className={`trow cols-ideas${idea.id === selected?.id ? " selected" : ""}${idea.status === "rejected" ? " dim" : ""}`}
                    onClick={() => {
                      selectIdea(idea.id);
                      setRejecting(false);
                    }}
                  >
                    <span className="stack gap-2">
                      <strong>{idea.title}</strong>
                      <span className="muted small">フック「{idea.hook}」</span>
                    </span>
                    <span className={isDuplicate(idea) ? "warn-text" : "ok-text"}>
                      {idea.status === "rejected" ? "" : isDuplicate(idea) ? "類似あり" : "問題なし"}
                    </span>
                    <span className={idea.status === "queued" ? "muted" : "accent-text"}>{STATUS_LABEL[idea.status]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="pane detail-pane">
          {selected ? (
            <>
              <div className="detail-scroll">
                <span className="eyebrow">企画の詳細</span>
                <h2 className="detail-title">{selected.title}</h2>
                <hr />
                <h4>この企画を提案した根拠</h4>
                <p className="body-text">{selected.rationale || selected.summary}</p>
                <ul className="bullets small">
                  <li>柱: {selected.pillar}</li>
                  <li>切り口: {selected.angle}</li>
                  <li>フック: {selected.hook}</li>
                </ul>
                <hr />
                <h4>{SLIDES.length}枚の構成案</h4>
                {/* MOCK: the deck outline is generated at creation time; this shows the template structure. */}
                <ol className="outline small">
                  {SLIDES.map((slide) => (
                    <li key={slide.index}>
                      {slide.index} {slide.role}
                    </li>
                  ))}
                </ol>
                {referenceTitles.length > 0 ? (
                  <>
                    <hr />
                    <h4>参照した資料</h4>
                    <p className="small muted">{referenceTitles.join(" ・ ")}</p>
                  </>
                ) : null}
              </div>
              {rejecting ? (
                <div className="detail-foot stack gap-8">
                  <textarea
                    className="textarea"
                    rows={2}
                    aria-label="却下の理由"
                    placeholder="却下の理由(次回以降の提案に反映されます)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="row gap-8">
                    <button className="btn outline" onClick={() => setRejecting(false)}>
                      キャンセル
                    </button>
                    <button className="btn danger grow" onClick={() => void reject(selected)}>
                      却下する
                    </button>
                  </div>
                </div>
              ) : (
                <div className="detail-foot row gap-8">
                  <button
                    className="btn outline"
                    disabled={selected.status !== "queued"}
                    onClick={() => setRejecting(true)}
                  >
                    却下
                  </button>
                  <button
                    className="btn primary grow"
                    disabled={selected.status !== "queued" || starting}
                    onClick={() => void generate(selected)}
                  >
                    {starting ? "開始中…" : `この企画で${SLIDES.length}枚を生成する`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="empty">企画を選択してください</p>
          )}
        </aside>
      </div>
    </>
  );
}
