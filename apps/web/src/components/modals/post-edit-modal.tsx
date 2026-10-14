"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { useWorkspace } from "../workspace-context";
import { STATUS_LABEL } from "../../lib/mock-data";
import { Modal } from "./modal";

export function PostEditModal({ postId }: { postId: string }) {
  const { posts, accounts, closeModal, updatePost, deletePost, notify } = useWorkspace();
  const post = posts.find((p) => p.id === postId);
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [scheduledAt, setScheduledAt] = useState(post?.scheduledAt ?? "");

  if (!post) return null;
  const handle = accounts.find((a) => a.id === post.accountId)?.handle ?? "";

  return (
    <Modal
      title="投稿の編集・詳細"
      width={900}
      onClose={closeModal}
      footer={
        <>
          <button
            className="btn danger spacer"
            onClick={() => {
              deletePost(post.id);
              notify("投稿を削除しました");
              closeModal();
            }}
          >
            削除する
          </button>
          <button className="btn ghost" onClick={closeModal}>
            キャンセル
          </button>
          <button
            className="btn primary"
            onClick={() => {
              updatePost(post.id, { caption, scheduledAt: scheduledAt.trim() || null });
              notify("変更を保存しました");
              closeModal();
            }}
          >
            変更を保存
          </button>
        </>
      }
    >
      <div className="two-col" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="stack gap-16">
          <div className="stack gap-8">
            <span className="label">メディアプレビュー</span>
            <div className="image-box" style={{ height: 220 }}>
              <Icon name="image" size={32} />
            </div>
          </div>
          <div className="stack gap-8">
            <label className="label" htmlFor="edit-caption">
              キャプション
            </label>
            <textarea
              id="edit-caption"
              className="textarea"
              rows={7}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
        </div>
        <div className="stack gap-16">
          <div className="tile">
            <span className="label">ステータス</span>
            <span className="status">
              <span className={`dot ${post.status}`} />
              {STATUS_LABEL[post.status]}
            </span>
          </div>
          <div className="tile">
            <span className="label">アカウント</span>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="instagram" size={14} />
              {handle}
            </span>
          </div>
          <div className="tile">
            <label className="label" htmlFor="edit-schedule">
              予定日時
            </label>
            <input
              id="edit-schedule"
              className="input"
              placeholder="2026/02/14 18:00"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
