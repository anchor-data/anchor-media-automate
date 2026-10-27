"use client";

import Link from "next/link";
import { useState } from "react";
import { PageTopbar, Tabs } from "../ui/page";
import { useQueueIdeas } from "../use-queue-ideas";
import {
  AI_INSIGHT,
  DAILY_REACH,
  DAILY_REACH_LABELS,
  PERFORMANCE_KPIS,
  POSTING_HEATMAP,
  SAVE_RATE_RANKING
} from "../../lib/mock-analytics";

type Range = "7" | "30" | "90";

const HEAT_ROWS = ["朝", "昼", "夜"] as const;
const HEAT_COLS = ["月", "火", "水", "木", "金", "土", "日"] as const;
const HEAT_COLORS = ["#EAF0FD", "#C9D6F2", "#8FA8E3", "#5E80D6", "#1A4BC4"] as const;

function heatColor(value: number): string {
  return HEAT_COLORS[Math.min(HEAT_COLORS.length - 1, Math.floor(value * HEAT_COLORS.length))] ?? HEAT_COLORS[0];
}

/** Downloads the (mock) numbers as CSV so the export button does something real. */
function exportCsv(range: Range): void {
  const rows = [
    ["metric", "value", "delta"],
    ...PERFORMANCE_KPIS.map((k) => [k.label, k.value.replace(/,/g, ""), k.delta]),
    [],
    ["day", "reach"],
    ...DAILY_REACH.map((value, i) => [String(i + 1), String(value)])
  ];
  const csv = rows.map((row) => row.join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `performance-${range}d.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AnalyticsPerformancePage() {
  const [range, setRange] = useState<Range>("30");
  const { queue, busy } = useQueueIdeas();
  const max = Math.max(...DAILY_REACH);
  const bestIndex = DAILY_REACH.indexOf(max);

  return (
    <>
      <PageTopbar title="パフォーマンス">
        <Tabs
          variant="pill"
          label="期間"
          value={range}
          onChange={setRange}
          options={[
            { id: "7", label: "7日" },
            { id: "30", label: "30日" },
            { id: "90", label: "90日" }
          ]}
        />
        <button className="btn outline" onClick={() => exportCsv(range)}>
          CSVで出力
        </button>
      </PageTopbar>
      <div className="page-body pad-32">
        <p className="mock-note small">サンプルデータを表示しています(Instagramインサイト連携は準備中)</p>
        <div className="kpi-row">
          {PERFORMANCE_KPIS.map((kpi) => (
            <div className="kpi" key={kpi.label}>
              <span className="muted small">{kpi.label}</span>
              <div className="row gap-8 baseline">
                <strong className="kpi-value">{kpi.value}</strong>
                <span className={`small strong ${kpi.up ? "ok-text" : "danger-text"}`}>{kpi.delta}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="analytics-cols">
          <div className="stack gap-24">
            <section>
              <div className="row between">
                <h3 className="section-title">日別リーチ</h3>
                <span className="muted small">ベストは 10/26(日) {max.toLocaleString()}</span>
              </div>
              <div className="bar-chart" role="img" aria-label="日別リーチの棒グラフ">
                {DAILY_REACH.map((value, i) => (
                  <span key={i} className={i === bestIndex ? "best" : undefined} style={{ height: `${(value / max) * 100}%` }} />
                ))}
              </div>
              <div className="axis small muted">
                {DAILY_REACH_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </section>
            <section>
              <div className="row between">
                <h3 className="section-title">投稿時間の反応(保存率)</h3>
                <span className="muted small">濃いほど高い</span>
              </div>
              <div className="heatmap">
                <span />
                {HEAT_COLS.map((c) => (
                  <span className="muted small center" key={c}>
                    {c}
                  </span>
                ))}
                {POSTING_HEATMAP.map((row, r) => (
                  <HeatRow key={HEAT_ROWS[r]} label={HEAT_ROWS[r] ?? ""} values={row} />
                ))}
              </div>
            </section>
          </div>
          <aside className="stack gap-16">
            <div className="row between">
              <h3 className="section-title">保存率ランキング</h3>
              <Link className="link small" href="/analytics/posts">
                投稿別の詳細へ
              </Link>
            </div>
            <ol className="ranking">
              {SAVE_RATE_RANKING.map((post, i) => (
                <li key={post.id}>
                  <span className={`rank-no${i < 3 ? " top" : ""}`}>{i + 1}</span>
                  <span className="stack gap-2 grow">
                    <strong>{post.title}</strong>
                    <span className="muted small">
                      リーチ {post.reach} · {post.publishedAt}公開
                    </span>
                  </span>
                  <strong className="rank-rate">{post.saveRate}</strong>
                </li>
              ))}
            </ol>
            <div className="note-box roomy">
              <strong>AIの気づき</strong>
              <p className="muted small">{AI_INSIGHT}</p>
              <button className="btn dark block" disabled={busy} onClick={() => void queue(AI_INSIGHT)}>
                {busy ? "追加中…" : "提案をアイデアキューに追加"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function HeatRow({ label, values }: { label: string; values: readonly number[] }) {
  return (
    <>
      <span className="muted small">{label}</span>
      {values.map((value, i) => (
        <span className="heat-cell" key={i} style={{ background: heatColor(value) }} />
      ))}
    </>
  );
}
