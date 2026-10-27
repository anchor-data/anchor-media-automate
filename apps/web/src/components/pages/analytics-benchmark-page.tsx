"use client";

import { Icon } from "../icon";
import { PageTopbar } from "../ui/page";
import { useQueueIdeas } from "../use-queue-ideas";
import { useWorkspace } from "../workspace-context";
import { BENCHMARK_ROWS, FORMAT_SAVE_RATES, RIVAL_POSTS } from "../../lib/mock-analytics";

export function AnalyticsBenchmarkPage() {
  const { notify } = useWorkspace();
  const { queue, busy } = useQueueIdeas();
  const maxRate = Math.max(...FORMAT_SAVE_RATES.flatMap((f) => [f.own, f.rival]));
  const seed = RIVAL_POSTS.map((post) => `${post.title}(${post.hook})`).join("\n");

  return (
    <>
      <PageTopbar title="競合ベンチマーク">
        <span className="muted small">公開データのみ取得 · 毎日 04:00 更新</span>
        <button className="btn primary" onClick={() => notify("競合アカウントの追加は準備中です")}>
          <Icon name="plus" size={14} />
          アカウントを追加
        </button>
      </PageTopbar>
      <div className="split">
        <section className="pane grow pad-32">
          <p className="mock-note small">サンプルデータを表示しています(競合データの取得は準備中)</p>
          <h3 className="section-title">追跡アカウントの比較(直近30日)</h3>
          <div className="table">
            <div className="trow head cols-bench">
              <span>アカウント</span>
              <span className="right">フォロワー</span>
              <span className="right">週の投稿</span>
              <span className="right">保存率</span>
              <span className="right">反応率</span>
              <span className="right">伸び</span>
            </div>
            {BENCHMARK_ROWS.map((row) => (
              <div className={`trow cols-bench static${row.own ? " selected" : ""}`} key={row.account}>
                <strong>{row.account}</strong>
                <span className="right">{row.followers}</span>
                <span className="right">{row.weekly}</span>
                <span className={`right strong ${row.own ? "accent-text" : row.best ? "warn-text" : ""}`}>{row.saveRate}</span>
                <span className="right">{row.engagement}</span>
                <span className={`right strong ${row.growthUp ? "ok-text" : "danger-text"}`}>{row.growth}</span>
              </div>
            ))}
          </div>
          <div className="row between pad-t-24">
            <h3 className="section-title">フォーマット別の保存率</h3>
            <span className="legend-inline small muted">
              <i className="own" /> 自社 <i className="rival" /> 競合平均
            </span>
          </div>
          <ul className="format-bars">
            {FORMAT_SAVE_RATES.map((item) => (
              <li key={item.label}>
                <span className="muted small">{item.label}</span>
                <span className="stack gap-2 grow">
                  <span className="fbar own" style={{ width: `${(item.own / maxRate) * 100}%` }} />
                  <span className="fbar rival" style={{ width: `${(item.rival / maxRate) * 100}%` }} />
                </span>
                <strong className="small">
                  {item.own}% / {item.rival}%
                </strong>
              </li>
            ))}
          </ul>
        </section>
        <aside className="pane side-pane wide">
          <h3 className="pane-title">競合の注目投稿</h3>
          <ul className="plain-list rival-list">
            {RIVAL_POSTS.map((post) => (
              <li key={post.title}>
                <span className="muted small">{post.meta}</span>
                <strong>{post.title}</strong>
                <span className="muted small">{post.hook}</span>
              </li>
            ))}
          </ul>
          <div className="note-box roomy">
            <strong>自社に取り入れるなら</strong>
            <p className="muted small">「実例開示」型のフックは自社で未使用です。年収別の職務経歴書を企画案に追加しますか？</p>
            <button className="btn dark block" disabled={busy} onClick={() => void queue(seed)}>
              {busy ? "追加中…" : "アイデアキューに追加"}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
