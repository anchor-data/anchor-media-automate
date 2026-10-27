"use client";

import Link from "next/link";
import { PageTopbar } from "../ui/page";
import { useQueueIdeas } from "../use-queue-ideas";
import { POST_DETAIL } from "../../lib/mock-analytics";

export function AnalyticsPostPage() {
  const { queue, busy } = useQueueIdeas();
  const seed = POST_DETAIL.insights.map((item) => `${item.title}: ${item.body}`).join("\n");
  const minReach = Math.min(...POST_DETAIL.reach.map((r) => r.value));

  return (
    <>
      <PageTopbar
        title={
          <span className="crumbs">
            <Link href="/analytics">パフォーマンス</Link>
            <span className="muted">/</span>
            <strong>{POST_DETAIL.title.slice(0, 8)}…</strong>
          </span>
        }
      />
      <div className="page-body pad-32">
        <p className="mock-note small">サンプルデータを表示しています(Instagramインサイト連携は準備中)</p>
        <div className="post-analytics">
          <div className="stack gap-12">
            <div className="slide-card dark">
              <span className="eyebrow light">KNOW-HOW 01</span>
              <strong>{POST_DETAIL.title}</strong>
            </div>
            <dl className="facts small">
              <div>
                <dt>公開日時</dt>
                <dd>{POST_DETAIL.publishedAt}</dd>
              </div>
              <div>
                <dt>種別</dt>
                <dd>{POST_DETAIL.kind}</dd>
              </div>
              <div>
                <dt>テンプレート</dt>
                <dd>{POST_DETAIL.template}</dd>
              </div>
              <div>
                <dt>承認者</dt>
                <dd>{POST_DETAIL.approver}</dd>
              </div>
            </dl>
          </div>
          <div className="stack gap-24">
            <div className="kpi-row four">
              {POST_DETAIL.metrics.map((metric) => (
                <div className="kpi" key={metric.label}>
                  <span className="muted small">{metric.label}</span>
                  <strong className={`kpi-value${metric.accent ? " accent-text" : ""}`}>{metric.value}</strong>
                </div>
              ))}
            </div>
            <section>
              <div className="row between">
                <h3 className="section-title">スライド別の到達率</h3>
                <span className="muted small">スライド7で大きく離脱しています</span>
              </div>
              <ul className="hbars">
                {POST_DETAIL.reach.map((row) => (
                  <li key={row.label}>
                    <span className="muted small">{row.label}</span>
                    <span className="hbar-track">
                      <span
                        className={row.value === minReach || row.label.startsWith("7") ? "warn" : row.value === 100 ? "full" : undefined}
                        style={{ width: `${row.value}%` }}
                      />
                    </span>
                    <strong className={`small${row.label.startsWith("7") ? " warn-text" : ""}`}>{row.value}%</strong>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <aside className="stack gap-12 insights">
            <h3 className="section-title">AIの改善提案</h3>
            {POST_DETAIL.insights.map((insight) => (
              <div className="insight" key={insight.tag}>
                <span className={`insight-tag ${insight.tone}`}>{insight.tag}</span>
                <strong>{insight.title}</strong>
                <p className="muted small">{insight.body}</p>
              </div>
            ))}
            <button className="btn primary block" disabled={busy} onClick={() => void queue(seed)}>
              {busy ? "追加中…" : "提案をアイデアキューに追加"}
            </button>
          </aside>
        </div>
      </div>
    </>
  );
}
