"use client";

import { useState } from "react";
import type { Idea } from "@ama/shared";
import { AccountSidebar } from "./account-sidebar";
import { Icon } from "./icon";
import { PostDetailPanel } from "./post-detail-panel";
import { useWorkspace } from "./workspace-context";
import { STATUS_LABEL, WEEKDAYS, type MockPost } from "../lib/mock-data";

const IDEA_STATUS_LABEL: Record<Idea["status"], string> = {
  queued: "アイデア",
  selected: "採用済み",
  rejected: "却下",
  used: "使用済み"
};

function calendarDay(iso: string): number {
  const date = new Date(iso);
  const day = Number.isNaN(date.getTime()) ? 1 : date.getDate();
  return Math.min(Math.max(day, 1), 28);
}

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未定";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}/${month}/${day}`;
}

type ViewMode = "calendar" | "list";

const WEEKS: readonly (readonly number[])[] = [0, 1, 2, 3].map((w) =>
  Array.from({ length: 7 }, (_, d) => w * 7 + d + 1)
);

function CalendarGrid({
  posts,
  ideas
}: {
  posts: readonly MockPost[];
  ideas: readonly Idea[];
}) {
  const { selectedPostId, selectedIdeaId, selectPost, selectIdea } = useWorkspace();

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
                {ideas
                  .filter((idea) => calendarDay(idea.createdAt) === day)
                  .map((idea) => (
                    <button
                      key={idea.id}
                      className={`chip idea${idea.id === selectedIdeaId ? " selected" : ""}`}
                      onClick={() => selectIdea(idea.id)}
                    >
                      <Icon name="lightbulb" size={12} />
                      <span>{idea.title}</span>
                    </button>
                  ))}
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

function PostList({
  posts,
  ideas,
  handle
}: {
  posts: readonly MockPost[];
  ideas: readonly Idea[];
  handle: string;
}) {
  const { selectedPostId, selectedIdeaId, selectPost, selectIdea } = useWorkspace();

  return (
    <div className="table">
      <div className="trow head">
        <span>投稿内容</span>
        <span>ステータス</span>
        <span>予定日時</span>
        <span>アカウント</span>
      </div>
      {posts.length === 0 && ideas.length === 0 ? (
        <p className="empty">投稿もアイデアもありません</p>
      ) : null}
      {ideas.map((idea) => (
        <button
          key={idea.id}
          className={`trow${idea.id === selectedIdeaId ? " selected" : ""}`}
          onClick={() => selectIdea(idea.id)}
        >
          <span className="row" style={{ gap: 12, minWidth: 0 }}>
            <span className="thumb">
              <Icon name="lightbulb" size={16} />
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {idea.title}
            </span>
          </span>
          <span className="status">
            <span className="dot idea" />
            {IDEA_STATUS_LABEL[idea.status]}
          </span>
          <span className="muted">{formatCreatedAt(idea.createdAt)}</span>
          <span className="row muted" style={{ gap: 6 }}>
            <Icon name="instagram" size={14} />
            {handle}
          </span>
        </button>
      ))}
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
  const { posts, ideas, accounts, activeAccountId, openModal } = useWorkspace();
  const [mode, setMode] = useState<ViewMode>("calendar");

  const accountPosts = posts.filter((p) => p.accountId === activeAccountId);
  const accountIdeas = ideas.filter((idea) => idea.accountId === activeAccountId);
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
          <CalendarGrid posts={accountPosts} ideas={accountIdeas} />
        ) : (
          <PostList posts={accountPosts} ideas={accountIdeas} handle={handle} />
        )}
      </main>
      <PostDetailPanel />
    </>
  );
}
