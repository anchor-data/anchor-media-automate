"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { PageTopbar } from "../ui/page";
import { Icon } from "../icon";
import { useWorkspace } from "../workspace-context";
import { aiQualityScore, predictedSaveRate } from "../../lib/mock-score";
import { generationProgress, isActive, stageOf, type PostStage } from "../../lib/post-stage";
import { formatMonthDayTime, formatWaiting } from "../../lib/schedule";

type ColumnId = "idea" | "generating" | "review" | "approved" | "scheduled";

interface ColumnDef {
  readonly id: ColumnId;
  readonly label: string;
  readonly tone: "idea" | "generating" | "review" | "approved" | "scheduled";
}

const COLUMNS: readonly ColumnDef[] = [
  { id: "idea", label: "アイデア", tone: "idea" },
  { id: "generating", label: "生成中", tone: "generating" },
  { id: "review", label: "レビュー", tone: "review" },
  { id: "approved", label: "承認済み", tone: "approved" },
  { id: "scheduled", label: "予約済み", tone: "scheduled" }
];

const COLLAPSED_COUNT = 3;

interface ColumnProps {
  readonly def: ColumnDef;
  readonly count: number;
  readonly cards: readonly ReactNode[];
}

function Column({ def, count, cards }: ColumnProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cards : cards.slice(0, COLLAPSED_COUNT);
  const rest = cards.length - visible.length;
  return (
    <section className={`kanban-col ${def.tone}`} aria-label={def.label}>
      <header>
        <span className={`col-dot ${def.tone}`} />
        <strong>{def.label}</strong>
        <span className="col-count">{count}</span>
      </header>
      <div className="kanban-cards">
        {cards.length === 0 ? <p className="kanban-empty">なし</p> : visible}
        {rest > 0 ? (
          <button className="kanban-more" onClick={() => setExpanded(true)}>
            他 {rest}件を表示
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function PipelinePage() {
  const router = useRouter();
  const { posts, ideas, activeAccountId, selectIdea, selectPost, addDraftFromIdea, retryGeneration, notify } =
    useWorkspace();
  const [busyId, setBusyId] = useState<string | null>(null);

  const accountPosts = posts.filter((p) => p.accountId === activeAccountId && isActive(p));
  const inStage = (...stages: PostStage[]) => accountPosts.filter((p) => stages.includes(stageOf(p)));
  const queuedIdeas = ideas.filter((i) => i.accountId === activeAccountId && i.status === "queued");

  const decided = posts.filter(
    (p) => p.accountId === activeAccountId && ["approved", "scheduled", "published", "rejected"].includes(stageOf(p))
  );
  const approvedCount = decided.filter((p) => stageOf(p) !== "rejected").length;
  const approvalRate = decided.length > 0 ? `${Math.round((approvedCount / decided.length) * 100)}%` : "—";

  const startFromIdea = async (ideaId: string) => {
    const idea = queuedIdeas.find((i) => i.id === ideaId);
    if (!idea) return;
    setBusyId(ideaId);
    const postId = await addDraftFromIdea({ id: idea.id, title: idea.title, summary: idea.summary });
    setBusyId(null);
    if (postId) notify("コンテンツの生成を開始しました");
  };

  const ideaCards = queuedIdeas.map((idea) => (
    <article className="kcard" key={idea.id}>
      <button
        className="kcard-main"
        onClick={() => {
          selectIdea(idea.id);
          router.push("/ideas");
        }}
      >
        <strong>{idea.title}</strong>
        <span className="muted small">
          {idea.jobId ? "求人ピック" : "ノウハウ"} · 予測保存率 {predictedSaveRate(idea.id)}%
        </span>
      </button>
      <button className="kcard-action" disabled={busyId === idea.id} onClick={() => void startFromIdea(idea.id)}>
        <Icon name="sparkles" size={12} />
        {busyId === idea.id ? "開始中…" : "生成する"}
      </button>
    </article>
  ));

  const generatingCards = inStage("generating", "failed").map((post) => {
    const failed = stageOf(post) === "failed";
    return (
      <article className={`kcard${failed ? " failed" : ""}`} key={post.id}>
        <Link href={`/editor/${post.id}`} className="kcard-main">
          <strong>{post.title}</strong>
          {failed ? (
            <span className="kcard-error small">失敗: {post.generationError ?? "生成に失敗しました"}</span>
          ) : (
            <>
              <span className="progress">
                <span style={{ width: `${Math.round(generationProgress(post) * 100)}%` }} />
              </span>
              <span className="muted small">
                {post.generationStatus === "rendering" ? "Canvaで画像を生成中" : "スライドの文章を作成中"}
              </span>
            </>
          )}
        </Link>
        {failed ? (
          <button className="kcard-action" onClick={() => void retryGeneration(post.id)}>
            <Icon name="refresh" size={12} />
            再試行
          </button>
        ) : null}
      </article>
    );
  });

  const reviewCards = inStage("review").map((post) => (
    <article className="kcard" key={post.id}>
      <button
        className="kcard-main"
        onClick={() => {
          selectPost(post.id);
          router.push("/review");
        }}
      >
        <strong>{post.title}</strong>
        <span className="muted small">
          AI品質 {aiQualityScore(post.id)} · {formatWaiting(post.updatedAt ?? post.createdAt)}から待機
        </span>
      </button>
    </article>
  ));

  const simpleCards = (stages: PostStage[], meta: (id: string, iso: string) => string) =>
    inStage(...stages).map((post) => (
      <article className="kcard" key={post.id}>
        <Link href={`/editor/${post.id}`} className="kcard-main">
          <strong>{post.title}</strong>
          <span className="small accent-text">{meta(post.id, post.dateIso)}</span>
        </Link>
      </article>
    ));

  const approvedCards = simpleCards(["approved"], () => "日程の割り当て待ち");
  const scheduledCards = simpleCards(["scheduled", "published"], (_, iso) => formatMonthDayTime(iso));

  const columns: Record<ColumnId, { count: number; cards: readonly ReactNode[] }> = {
    idea: { count: queuedIdeas.length, cards: ideaCards },
    generating: { count: generatingCards.length, cards: generatingCards },
    review: { count: reviewCards.length, cards: reviewCards },
    approved: { count: approvedCards.length, cards: approvedCards },
    scheduled: { count: scheduledCards.length, cards: scheduledCards }
  };

  return (
    <>
      <PageTopbar title="制作パイプライン">
        {/* MOCK: assignee / kind filters need member + post-type data. */}
        <span className="muted small">担当: すべて</span>
        <span className="muted small">種別: すべて</span>
      </PageTopbar>
      <div className="page-body pad-32">
        <div className="page-head">
          <div>
            <h1>企画から公開まで、いまどこ？</h1>
            <p className="muted">アイデアから生成を始め、承認は「レビュー」から行います。</p>
          </div>
          <p className="stats small">
            {/* MOCK: lead time needs per-stage timestamps. */}
            平均リードタイム <strong>2.4日</strong> ・ 承認率 <strong>{approvalRate}</strong>
          </p>
        </div>
        <div className="kanban">
          {COLUMNS.map((def) => (
            <Column key={def.id} def={def} count={columns[def.id].count} cards={columns[def.id].cards} />
          ))}
        </div>
      </div>
    </>
  );
}
