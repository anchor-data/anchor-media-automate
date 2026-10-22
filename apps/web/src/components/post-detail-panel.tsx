"use client";

import { useState } from "react";
import type { Idea } from "@ama/shared";
import { Icon } from "./icon";
import { WorkflowSteps, type WorkflowStep } from "./workflow-steps";
import { useWorkspace } from "./workspace-context";
import { STATUS_LABEL, type MockPost } from "../lib/mock-data";

const IDEA_STATUS_LABEL: Record<Idea["status"], string> = {
  queued: "アイデア",
  selected: "採用済み",
  rejected: "却下",
  used: "使用済み"
};

export function PostDetailPanel() {
  const {
    posts,
    ideas,
    selectedPostId,
    selectedIdeaId,
    selectPost,
    selectIdea,
    openModal,
    deletePost,
    approvePost,
    addDraftFromIdea,
    notify
  } = useWorkspace();
  const idea = ideas.find((item) => item.id === selectedIdeaId) ?? null;
  const post = posts.find((p) => p.id === selectedPostId) ?? null;
  const [shown, setShown] = useState<MockPost | null>(null);

  if (post && post !== shown) {
    setShown(post);
  }

  const display = post ?? shown;
  const open = idea !== null || post !== null;
  const sourceIdea = display?.ideaId ? ideas.find((i) => i.id === display.ideaId) ?? null : null;
  const postSteps: readonly WorkflowStep[] = display
    ? [
        {
          key: "idea",
          label: "アイデア",
          state: "done",
          onSelect: sourceIdea ? () => selectIdea(sourceIdea.id) : undefined
        },
        {
          key: "content",
          label: "コンテンツ",
          state: display.status === "draft" ? "current" : "done"
        },
        {
          key: "schedule",
          label: "予約",
          state: display.status === "draft" ? "upcoming" : display.status === "scheduled" ? "current" : "done"
        }
      ]
    : [];

  if (idea) {
    const linkedPost = posts.find((p) => p.ideaId === idea.id) ?? null;
    const ideaSteps: readonly WorkflowStep[] = [
      { key: "idea", label: "アイデア", state: linkedPost ? "done" : "current" },
      {
        key: "content",
        label: "コンテンツ",
        state: linkedPost ? "current" : "upcoming",
        onSelect: linkedPost ? () => selectPost(linkedPost.id) : undefined
      },
      { key: "schedule", label: "予約", state: "upcoming" }
    ];
    return (
      <aside className="detail open">
        <div className="detail-sheet">
          <div className="panel-head">
            <h3>アイデア</h3>
            <button aria-label="閉じる" onClick={() => selectIdea(null)}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="panel-body" key={idea.id}>
            <WorkflowSteps steps={ideaSteps} />
            <div className="row" style={{ gap: 8, color: "var(--text-secondary)" }}>
              <span className="dot idea" />
              {IDEA_STATUS_LABEL[idea.status]}
            </div>
            <strong style={{ fontSize: 15 }}>{idea.title}</strong>
            <div className="stack gap-8">
              <span className="label">概要</span>
              <div className="field-box caption-text">{idea.summary}</div>
            </div>
            <div className="field-box stack gap-6" style={{ padding: "12px 16px" }}>
              <span className="small muted">柱: {idea.pillar}</span>
              <span className="small muted">フック: {idea.hook}</span>
              <span className="small muted">切り口: {idea.angle}</span>
            </div>
            {linkedPost ? (
              <button className="btn outline block" onClick={() => selectPost(linkedPost.id)}>
                コンテンツを見る
              </button>
            ) : (
              <button
                className="btn primary block"
                onClick={() => {
                  addDraftFromIdea({ id: idea.id, title: idea.title, summary: idea.summary });
                  notify("コンテンツの下書きを作成しました（画像生成は Phase 3）");
                }}
              >
                <Icon name="sparkles" size={14} />
                このアイデアでコンテンツを作成
              </button>
            )}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`detail${open ? " open" : ""}`} aria-hidden={open ? undefined : true} inert={open ? undefined : true}>
      {display ? (
        <div className="detail-sheet">
          <div className="panel-head">
            <h3>投稿詳細</h3>
            <button aria-label="閉じる" onClick={() => selectPost(null)}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="panel-body" key={display.id}>
            <WorkflowSteps steps={postSteps} />
            <div className="row" style={{ gap: 8, color: "var(--text-secondary)" }}>
              <span className={`dot ${display.status}`} />
              {display.scheduledAt
                ? `${display.scheduledAt} ${STATUS_LABEL[display.status]}`
                : STATUS_LABEL[display.status]}
            </div>
            <div className="stack gap-8">
              <span className="label">キャプション（投稿文）</span>
              <div className="field-box caption-text">{display.caption}</div>
            </div>
            <div className="stack gap-8">
              <span className="label">生成画像プレビュー</span>
              <div className="image-box">
                <Icon name="image" size={32} />
              </div>
            </div>
            <button
              className="field-box stack gap-6 link-card"
              style={{ padding: "6px 16px 12px" }}
              disabled={!sourceIdea}
              onClick={() => sourceIdea && selectIdea(sourceIdea.id)}
            >
              <span className="row small muted" style={{ gap: 6, paddingTop: 6 }}>
                <span style={{ color: "var(--accent-hover)", display: "inline-flex" }}>
                  <Icon name="lightbulb" size={14} />
                </span>
                企画元アイデア
              </span>
              <strong style={{ fontSize: 13 }}>{display.title}</strong>
              <span className="small muted">ターゲット: {display.ideaTarget}</span>
            </button>
            <div className="stack gap-12">
              <button
                className="btn primary block"
                onClick={() => openModal({ kind: "post-edit", postId: display.id })}
              >
                編集・修正する
              </button>
              <button
                className="btn outline block"
                onClick={() => {
                  deletePost(display.id);
                  notify("投稿を削除しました");
                }}
              >
                削除する
              </button>
              <button
                className="btn success block"
                disabled={display.status === "published"}
                onClick={() => {
                  approvePost(display.id);
                  notify("承認して予約しました");
                }}
              >
                承認して予約
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
