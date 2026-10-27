"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { SlideCarousel } from "../slide-carousel";
import { useWorkspace } from "../workspace-context";
import { STATUS_LABEL } from "../../lib/mock-data";
import { Modal } from "./modal";

export function PostEditModal({ postId }: { postId: string }) {
  const { posts, accounts, closeModal, updatePost, savePostCaption, deletePost, notify } = useWorkspace();
  const post = posts.find((p) => p.id === postId);
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [scheduledAt, setScheduledAt] = useState(post?.scheduledAt ?? "");
  const [saving, setSaving] = useState(false);

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
            disabled={saving}
            onClick={() => {
              setSaving(true);
              updatePost(post.id, { scheduledAt: scheduledAt.trim() || null });
              void savePostCaption(post.id, caption)
                .then(() => {
                  notify("変更を保存しました");
                  closeModal();
                })
                .catch((error: unknown) => notify(error instanceof Error ? error.message : "保存に失敗しました"))
                .finally(() => setSaving(false));
            }}
          >
            {saving ? "保存中…" : "変更を保存"}
          </button>
        </>
      }
    >
      <div className="two-col" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="stack gap-16">
          <div className="stack gap-8">
            <span className="label">メディアプレビュー</span>
            {post.assetUrls && post.assetUrls.length > 0 ? (
              <SlideCarousel urls={post.assetUrls} />
            ) : (
              <div className="image-box" style={{ height: 220 }}>
                <Icon name="image" size={32} />
                <span className="small muted">
                  {post.generationStatus && post.generationStatus !== "ready" ? "画像を生成中…" : "画像を読み込み中…"}
                </span>
              </div>
            )}
          </div>
          <div className="stack gap-8">
            <label className="label" htmlFor="edit-caption">
              キャプション（ハッシュタグも本文に入れる）
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
