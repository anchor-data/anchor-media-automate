"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageTopbar, Tabs } from "../ui/page";
import { SlideTile } from "../slide-tile";
import { useWorkspace } from "../workspace-context";
import { aiQualityScore } from "../../lib/mock-score";
import { REVIEW_CHECKS, REVIEW_COMMENTS } from "../../lib/mock-ops";
import { isActive, stageOf } from "../../lib/post-stage";
import {
  defaultScheduleDate,
  formatMonthDayTime,
  formatShortDateTime,
  formatWaiting,
  toIsoWithOffset,
  toLocalInputValue
} from "../../lib/schedule";
import { SLIDES, slideHeadline } from "../../lib/slides";

type ListTab = "mine" | "all";

function Caption({ text }: { text: string }) {
  return (
    <p className="caption-body">
      {text.split(/(#\S+)/g).map((part, i) =>
        part.startsWith("#") ? (
          <span className="hashtag" key={i}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function ReviewPage() {
  const { posts, activeAccountId, selectedPostId, selectPost, approvePost, retryGeneration, notify } = useWorkspace();
  const [tab, setTab] = useState<ListTab>("mine");
  const [scheduleValue, setScheduleValue] = useState(() => toLocalInputValue(defaultScheduleDate()));
  const [approving, setApproving] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [feedback, setFeedback] = useState("");

  const accountPosts = useMemo(() => posts.filter((p) => p.accountId === activeAccountId && isActive(p)), [posts, activeAccountId]);
  const pending = accountPosts.filter((p) => stageOf(p) === "review");
  const generating = accountPosts.filter((p) => stageOf(p) === "generating");
  const listed = tab === "mine" ? pending : [...pending, ...generating];
  const selected = pending.find((p) => p.id === selectedPostId) ?? pending[0] ?? null;

  // Selecting loads the slide images lazily (see WorkspaceProvider).
  useEffect(() => {
    if (selected && selected.id !== selectedPostId) selectPost(selected.id);
  }, [selected, selectedPostId, selectPost]);

  const approve = async () => {
    if (!selected) return;
    const date = new Date(scheduleValue);
    if (Number.isNaN(date.getTime())) {
      notify("公開日時を入力してください");
      return;
    }
    setApproving(true);
    await approvePost(selected.id, toIsoWithOffset(date));
    setApproving(false);
  };

  const sendBack = async () => {
    if (!selected) return;
    const text = feedback.trim();
    if (!text) {
      notify("差し戻しの理由を入力してください");
      return;
    }
    await retryGeneration(selected.id, text);
    notify("差し戻して再生成を開始しました");
    setSendingBack(false);
    setFeedback("");
  };

  return (
    <>
      <PageTopbar title="承認・レビュー">
        <span className="muted small">
          あなたの承認待ち {pending.length}件 ・ 全体 {pending.length + generating.length}件
        </span>
      </PageTopbar>
      <div className="split">
        <section className="pane list-pane">
          <div className="pad-tabs">
            <Tabs
              label="一覧の切替"
              value={tab}
              onChange={setTab}
              options={[
                { id: "mine", label: `あなたの承認 ${pending.length}` },
                { id: "all", label: `すべて ${pending.length + generating.length}` }
              ]}
            />
          </div>
          {listed.length === 0 ? (
            <p className="empty">承認待ちの投稿はありません</p>
          ) : (
            <ul className="plain-list">
              {listed.map((post) => {
                const isPending = stageOf(post) === "review";
                return (
                  <li key={post.id}>
                    <button
                      className={`review-row${post.id === selected?.id ? " selected" : ""}`}
                      disabled={!isPending}
                      onClick={() => selectPost(post.id)}
                    >
                      <strong>{post.title}</strong>
                      <span className="muted small">
                        {isPending ? `AI品質 ${aiQualityScore(post.id)}` : "生成中…"}
                        {isPending ? ` · 予約 ${formatMonthDayTime(toIsoWithOffset(defaultScheduleDate()))}` : ""}
                      </span>
                      {isPending ? (
                        <span className="warn-text small strong">{formatWaiting(post.updatedAt ?? post.createdAt)}から待機中</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selected ? (
          <>
            <section className="pane grow pad-32 review-main">
              <h2 className="detail-title lg">{selected.title}</h2>
              <p className="muted small">
                ノウハウ · {SLIDES.length}枚 · 生成 {formatShortDateTime(selected.createdAt)}
              </p>
              <div className="slide-grid">
                {SLIDES.map((slide, i) => (
                  <SlideTile
                    key={slide.index}
                    variant="card"
                    index={i}
                    url={selected.assetUrls?.[i]}
                    headline={slideHeadline(selected.slides, i)}
                  />
                ))}
              </div>
              <hr />
              <h4>キャプション</h4>
              <Caption text={selected.caption} />
              <Link className="link small" href={`/editor/${selected.id}`}>
                スライドを編集する →
              </Link>
            </section>

            <aside className="pane approve-pane">
              <div className="detail-scroll">
                {/* MOCK: multi-step approval flow, automated checks and comments need backend support. */}
                <h4>承認フロー</h4>
                <ul className="flow small">
                  <li className="done">
                    <span>AI生成 · 品質チェック</span>
                    <span className="muted">{formatShortDateTime(selected.createdAt)}</span>
                  </li>
                  <li className="done">
                    <span>編集担当レビュー</span>
                    <span className="muted">{formatShortDateTime(selected.updatedAt)}</span>
                  </li>
                  <li className="now">
                    <strong>オーナー承認(あなた)</strong>
                    <span className="warn-text strong">いまここ</span>
                  </li>
                  <li className="todo">
                    <span>予約 {formatMonthDayTime(toIsoWithOffset(new Date(scheduleValue || Date.now())))}</span>
                  </li>
                </ul>
                <hr />
                <h4>自動チェック</h4>
                <ul className="checks small">
                  {REVIEW_CHECKS.map((check) => (
                    <li key={check.label}>
                      <span>{check.label}</span>
                      <strong className={check.tone === "ok" ? "ok-text" : "warn-text"}>{check.value}</strong>
                    </li>
                  ))}
                </ul>
                <hr />
                <h4>コメント {REVIEW_COMMENTS.length}</h4>
                <ul className="comments small">
                  {REVIEW_COMMENTS.map((comment) => (
                    <li key={comment.who}>
                      <strong>{comment.who}</strong> {comment.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="detail-foot stack gap-12">
                <label className="schedule-box">
                  <span className="muted small">公開日時</span>
                  <input
                    type="datetime-local"
                    aria-label="公開日時"
                    value={scheduleValue}
                    onChange={(e) => setScheduleValue(e.target.value)}
                  />
                </label>
                {sendingBack ? (
                  <div className="stack gap-8">
                    <textarea
                      className="textarea"
                      rows={3}
                      aria-label="差し戻しの理由"
                      placeholder="修正してほしい点(エージェントが反映して再生成します)"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                    <div className="row gap-8">
                      <button className="btn outline" onClick={() => setSendingBack(false)}>
                        キャンセル
                      </button>
                      <button className="btn primary grow" onClick={() => void sendBack()}>
                        この内容で再生成
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row gap-8">
                    <button className="btn outline" onClick={() => setSendingBack(true)}>
                      差し戻す
                    </button>
                    <button className="btn primary grow" disabled={approving} onClick={() => void approve()}>
                      {approving ? "予約中…" : "承認して予約する"}
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </>
        ) : (
          <section className="pane grow">
            <p className="empty">レビュー待ちの投稿を選択するとここに表示されます</p>
          </section>
        )}
      </div>
    </>
  );
}
