"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "../icon";
import { PageTopbar, Tabs } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import type { MockPost } from "../../lib/mock-data";
import { STAGE_LABEL, isActive, stageOf } from "../../lib/post-stage";
import {
  WEEKDAYS_SUN_FIRST,
  formatMonthDayTime,
  monthWeeks,
  parseDate,
  sameDay,
  weekOf,
  type MonthCell
} from "../../lib/schedule";

type ViewMode = "month" | "week" | "list";
type ChipKind = "published" | "scheduled" | "review" | "draft";

const VIEW_OPTIONS = [
  { id: "month", label: "月" },
  { id: "week", label: "週" },
  { id: "list", label: "リスト" }
] as const;

const LEGEND: readonly { kind: ChipKind; label: string }[] = [
  { kind: "published", label: "公開済み" },
  { kind: "scheduled", label: "予約済み" },
  { kind: "review", label: "承認待ち" },
  { kind: "draft", label: "下書き" }
];

function chipKind(post: MockPost): ChipKind {
  const stage = stageOf(post);
  if (stage === "published") return "published";
  if (stage === "scheduled" || stage === "approved") return "scheduled";
  if (stage === "review") return "review";
  return "draft";
}

const MAX_CHIPS = 3;

function DayCell({ cell, today, posts, tall }: { cell: MonthCell; today: Date; posts: readonly MockPost[]; tall: boolean }) {
  const isToday = sameDay(cell.date, today);
  const shown = posts.slice(0, MAX_CHIPS);
  const rest = posts.length - shown.length;
  return (
    <div className={`cal-cell${cell.inMonth ? "" : " out"}${isToday ? " today" : ""}${tall ? " tall" : ""}`}>
      <span className={`cal-date${isToday ? " today" : ""}`}>{cell.date.getDate()}</span>
      {shown.map((post) => (
        <Link key={post.id} href={`/editor/${post.id}`} className={`cal-chip ${chipKind(post)}`} title={post.title}>
          {post.title}
        </Link>
      ))}
      {rest > 0 ? <span className="cal-more">他 {rest}件</span> : null}
    </div>
  );
}

function PostRows({ posts, handle }: { posts: readonly MockPost[]; handle: string }) {
  if (posts.length === 0) return <p className="empty">投稿はまだありません</p>;
  return (
    <div className="table">
      <div className="trow head cols-list">
        <span>投稿内容</span>
        <span>ステータス</span>
        <span>予定日時</span>
        <span>アカウント</span>
      </div>
      {posts.map((post) => (
        <Link key={post.id} href={`/editor/${post.id}`} className="trow cols-list">
          <span className="cell-title">{post.title}</span>
          <span className={`pill ${chipKind(post)}`}>{STAGE_LABEL[stageOf(post)]}</span>
          <span className="muted">{post.scheduledAt ? formatMonthDayTime(post.dateIso) : "未定"}</span>
          <span className="muted">{handle}</span>
        </Link>
      ))}
    </div>
  );
}

export function CalendarPage() {
  const router = useRouter();
  const { posts, ideas, accounts, activeAccountId, openModal, selectIdea } = useWorkspace();
  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState<Date>(today);
  const [mode, setMode] = useState<ViewMode>("month");

  const accountPosts = useMemo(
    () => posts.filter((p) => p.accountId === activeAccountId && isActive(p)),
    [posts, activeAccountId]
  );
  const queued = ideas.filter((idea) => idea.accountId === activeAccountId && idea.status === "queued");
  const handle = accounts.find((a) => a.id === activeAccountId)?.handle ?? "";

  const postsOn = (date: Date) => accountPosts.filter((p) => {
    const d = parseDate(p.dateIso);
    return d !== null && sameDay(d, date);
  });

  const shift = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (mode === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction, 1);
    setAnchor(next);
  };

  const title = `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;
  const sortedPosts = [...accountPosts].sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  return (
    <>
      <PageTopbar title="カレンダー">
        <button className="btn primary" onClick={() => openModal({ kind: "idea" })}>
          <Icon name="plus" size={14} />
          アイデアから生成
        </button>
      </PageTopbar>
      <div className="split">
        <section className="pane grow pad-32">
          <div className="cal-toolbar">
            <h2 className="cal-title">{title}</h2>
            <div className="row gap-6">
              <button className="icon-btn bordered" aria-label="前へ" onClick={() => shift(-1)}>
                <Icon name="chevron-left" size={14} />
              </button>
              <button className="icon-btn bordered" aria-label="次へ" onClick={() => shift(1)}>
                <Icon name="chevron-right" size={14} />
              </button>
              <button className="btn outline sm" onClick={() => setAnchor(today)}>
                今日
              </button>
            </div>
            <ul className="legend">
              {LEGEND.map((item) => (
                <li key={item.kind}>
                  <span className={`legend-dot ${item.kind}`} />
                  {item.label}
                </li>
              ))}
            </ul>
            <Tabs variant="pill" label="表示切替" value={mode} options={VIEW_OPTIONS} onChange={setMode} />
          </div>

          {mode === "list" ? (
            <PostRows posts={sortedPosts} handle={handle} />
          ) : (
            <div className="cal">
              <div className="cal-head">
                {WEEKDAYS_SUN_FIRST.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              {mode === "week" ? (
                <div className="cal-row">
                  {weekOf(anchor).map((cell) => (
                    <DayCell key={cell.date.toISOString()} cell={cell} today={today} posts={postsOn(cell.date)} tall />
                  ))}
                </div>
              ) : (
                monthWeeks(anchor).map((week) => (
                  <div className="cal-row" key={week[0]?.date.toISOString()}>
                    {week.map((cell) => (
                      <DayCell key={cell.date.toISOString()} cell={cell} today={today} posts={postsOn(cell.date)} tall={false} />
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <aside className="pane side-pane">
          <h3 className="pane-title">未割り当ての企画</h3>
          <p className="muted small">承認済みの企画から投稿を生成します</p>
          {queued.length === 0 ? (
            <p className="empty">キューにある企画はありません</p>
          ) : (
            <ul className="plain-list">
              {queued.slice(0, 6).map((idea) => (
                <li key={idea.id}>
                  <button
                    className="queue-row"
                    onClick={() => {
                      selectIdea(idea.id);
                      router.push("/ideas");
                    }}
                  >
                    <strong>{idea.title}</strong>
                    <span className="small">
                      <em className={`kind ${idea.pillar === "求人ピック" ? "job" : ""}`}>{idea.pillar || "ノウハウ"}</em>
                      <span className="muted"> フック: {idea.hook.slice(0, 18)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {queued.length > 6 ? (
            <Link className="link small" href="/ideas">
              他 {queued.length - 6}件を表示
            </Link>
          ) : null}
          {/* MOCK: posting-time recommendation needs Instagram insights. */}
          <div className="note-box">
            <strong>おすすめの投稿時間</strong>
            <p className="muted small">平日 19:00 と 土曜 12:00 の保存率が高い傾向です(直近60日)</p>
          </div>
        </aside>
      </div>
    </>
  );
}
