"use client";

import { useState } from "react";
import type { Idea } from "@ama/shared";
import { Icon } from "./icon";
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

  if (idea) {
    return (
      <aside className="detail open">
        <div className="detail-sheet">
          <div className="panel-head">
            <h3>アイデア</h3>
            <button aria-label="閉じる" onClick={() => selectIdea(null)}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="panel-body">
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
          <div className="panel-body">
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
            <div className="field-box stack gap-6" style={{ padding: "6px 16px 12px" }}>
              <span className="row small muted" style={{ gap: 6, paddingTop: 6 }}>
                <span style={{ color: "var(--accent-hover)", display: "inline-flex" }}>
                  <Icon name="lightbulb" size={14} />
                </span>
                企画元アイデア
              </span>
              <strong style={{ fontSize: 13 }}>{display.title}</strong>
              <span className="small muted">ターゲット: {display.ideaTarget}</span>
            </div>
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
