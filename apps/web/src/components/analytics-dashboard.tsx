"use client";

import { AccountSidebar } from "./account-sidebar";
import { Icon } from "./icon";
import { useWorkspace } from "./workspace-context";
import { INSIGHTS, KPIS, REACH_BY_WEEKDAY, TOP_POSTS, WEEKDAYS } from "../lib/mock-data";

export function AnalyticsDashboard() {
  const { openModal, notify } = useWorkspace();
  const max = Math.max(...REACH_BY_WEEKDAY);

  return (
    <>
      <AccountSidebar />
      <main className="main">
        <div className="page-head">
          <h1>分析ダッシュボード</h1>
        </div>
        <div className="kpis">
          {KPIS.map((kpi) => (
            <section className="card kpi" key={kpi.label}>
              <span className="muted">{kpi.label}</span>
              <div className="row">
                <span className="value">{kpi.value}</span>
                <span className={`delta${kpi.up ? "" : " down"}`}>{kpi.delta}</span>
              </div>
            </section>
          ))}
        </div>
        <div className="analytics-grid">
          <section className="card">
            <h3>条件別比較 (リーチ推移)</h3>
            <div className="bars">
              {REACH_BY_WEEKDAY.map((value, i) => (
                <div className="bar-col" key={WEEKDAYS[i]}>
                  <div className="bar" style={{ height: `${(value / max) * 100}%` }} title={`${value}`} />
                  <span>{WEEKDAYS[i]}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <h3>次に試す切り口 (改善材料)</h3>
            {INSIGHTS.map((text) => (
              <div className="inset insight" key={text}>
                <Icon name="lightbulb" size={14} />
                {text}
              </div>
            ))}
            <button
              className="btn primary"
              onClick={() => {
                openModal({ kind: "idea" });
                notify("改善材料をもとに企画を生成します");
              }}
            >
              この材料で企画を生成する
            </button>
          </section>
          <section className="card">
            <h3>トップパフォーマンス投稿</h3>
            {TOP_POSTS.map((post) => (
              <div className="inset stack gap-8" key={post.title}>
                <strong style={{ fontSize: 13 }}>{post.title}</strong>
                <div className="perf-metrics">
                  <span>
                    <Icon name="eye" size={12} />
                    {post.views}
                  </span>
                  <span>
                    <Icon name="bookmark" size={12} />
                    {post.saves}
                  </span>
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
