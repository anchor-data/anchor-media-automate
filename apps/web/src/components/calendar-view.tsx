"use client";

import { useState } from "react";
import { AccountSidebar } from "./account-sidebar";
import { Icon } from "./icon";
import { PostDetailPanel } from "./post-detail-panel";
import { useWorkspace } from "./workspace-context";
import { STATUS_LABEL, WEEKDAYS, type MockPost } from "../lib/mock-data";

type ViewMode = "calendar" | "list";

const WEEKS: readonly (readonly number[])[] = [0, 1, 2, 3].map((w) =>
  Array.from({ length: 7 }, (_, d) => w * 7 + d + 1)
);

function CalendarGrid({ posts }: { posts: readonly MockPost[] }) {
  const { selectedPostId, selectPost } = useWorkspace();

  return (
    <div className="cal">
      <div className="cal-head">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="cal-weeks">
        {WEEKS.map((week) => (
          <div className="cal-week" key={week[0]}>
            {week.map((day) => (
              <div className="cal-day" key={day}>
                <span>{day}</span>
                {posts
                  .filter((p) => p.day === day)
                  .map((p) => (
                    <button
                      key={p.id}
                      className={`chip ${p.status}${p.id === selectedPostId ? " selected" : ""}`}
                      onClick={() => selectPost(p.id)}
                    >
                      <Icon name="instagram" size={12} />
                      <span>{p.title}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PostList({ posts, handle }: { posts: readonly MockPost[]; handle: string }) {
  const { selectedPostId, selectPost } = useWorkspace();

  return (
    <div className="table">
      <div className="trow head">
        <span>投稿内容</span>
        <span>ステータス</span>
        <span>予定日時</span>
        <span>アカウント</span>
      </div>
      {posts.length === 0 ? <p className="empty">投稿がありません</p> : null}
      {posts.map((p) => (
        <button
          key={p.id}
          className={`trow${p.id === selectedPostId ? " selected" : ""}`}
          onClick={() => selectPost(p.id)}
        >
          <span className="row" style={{ gap: 12, minWidth: 0 }}>
            <span className="thumb">
              <Icon name="image" size={16} />
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.title}
            </span>
          </span>
          <span className="status">
            <span className={`dot ${p.status}`} />
            {STATUS_LABEL[p.status]}
          </span>
          <span className="muted">{p.scheduledAt ?? "未定"}</span>
          <span className="row muted" style={{ gap: 6 }}>
            <Icon name="instagram" size={14} />
            {handle}
          </span>
        </button>
      ))}
    </div>
  );
}

export function CalendarView() {
  const { posts, accounts, activeAccountId, openModal } = useWorkspace();
  const [mode, setMode] = useState<ViewMode>("calendar");

  const accountPosts = posts.filter((p) => p.accountId === activeAccountId);
  const handle = accounts.find((a) => a.id === activeAccountId)?.handle ?? "";

  return (
    <>
      <AccountSidebar />
      <main className="main">
        <div className="page-head">
          <h1>カレンダー</h1>
          <div className="segmented" role="tablist">
            <button
              role="tab"
              aria-selected={mode === "calendar"}
              className={mode === "calendar" ? "active" : ""}
              onClick={() => setMode("calendar")}
            >
              <Icon name="calendar" size={14} />
              カレンダー
            </button>
            <button
              role="tab"
              aria-selected={mode === "list"}
              className={mode === "list" ? "active" : ""}
              onClick={() => setMode("list")}
            >
              <Icon name="list" size={14} />
              リスト
            </button>
          </div>
          <button className="btn primary" onClick={() => openModal({ kind: "idea" })}>
            <Icon name="sparkles" size={14} />
            アイデアから生成
          </button>
        </div>
        {mode === "calendar" ? (
          <CalendarGrid posts={accountPosts} />
        ) : (
          <PostList posts={accountPosts} handle={handle} />
        )}
      </main>
      <PostDetailPanel />
    </>
  );
}
