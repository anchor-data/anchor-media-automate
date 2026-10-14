"use client";

import { Icon } from "./icon";
import { useWorkspace } from "./workspace-context";
import { STATUS_LABEL } from "../lib/mock-data";

export function PostDetailPanel() {
  const { posts, selectedPostId, selectPost, openModal, deletePost, approvePost, notify } =
    useWorkspace();
  const post = posts.find((p) => p.id === selectedPostId);

  return (
    <aside className="detail">
      <div className="panel-head">
        <h3>投稿詳細</h3>
        {post ? (
          <button aria-label="閉じる" onClick={() => selectPost(null)}>
            <Icon name="x" size={16} />
          </button>
        ) : null}
      </div>
      {post ? (
        <div className="panel-body">
          <div className="row" style={{ gap: 8, color: "var(--text-secondary)" }}>
            <span className={`dot ${post.status}`} />
            {post.scheduledAt ? `${post.scheduledAt} ${STATUS_LABEL[post.status]}` : STATUS_LABEL[post.status]}
          </div>
          <div className="stack gap-8">
            <span className="label">キャプション（投稿文）</span>
            <div className="field-box caption-text">{post.caption}</div>
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
            <strong style={{ fontSize: 13 }}>{post.title}</strong>
            <span className="small muted">ターゲット: {post.ideaTarget}</span>
          </div>
          <div className="stack gap-12">
            <button
              className="btn primary block"
              onClick={() => openModal({ kind: "post-edit", postId: post.id })}
            >
              編集・修正する
            </button>
            <button
              className="btn outline block"
              onClick={() => {
                deletePost(post.id);
                notify("投稿を削除しました");
              }}
            >
              削除する
            </button>
            <button
              className="btn success block"
              disabled={post.status === "published"}
              onClick={() => {
                approvePost(post.id);
                notify("承認して予約しました");
              }}
            >
              承認して予約
            </button>
          </div>
        </div>
      ) : (
        <p className="empty">投稿を選択すると詳細が表示されます</p>
      )}
    </aside>
  );
}
