"use client";

import { useState } from "react";
import { PageTopbar, Tabs } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { AGENT_RUNS, RUN_STEPS, RUN_SUMMARY, RUN_USAGE, type AgentRunMock } from "../../lib/mock-ops";

type LogTab = "all" | "ideas" | "slides" | "failed";

const matches = (tab: LogTab, run: AgentRunMock): boolean => {
  switch (tab) {
    case "ideas":
      return run.kind === "アイデア提案";
    case "slides":
      return run.kind === "スライド生成" || run.kind === "一部再生成";
    case "failed":
      return !run.ok;
    default:
      return true;
  }
};

/** MOCK: the backend does not record agent runs yet. */
export function AgentLogsPage() {
  const { notify } = useWorkspace();
  const [tab, setTab] = useState<LogTab>("all");
  const [selectedId, setSelectedId] = useState<string>(AGENT_RUNS[0]?.id ?? "");
  const [showIo, setShowIo] = useState(false);

  const runs = AGENT_RUNS.filter((run) => matches(tab, run));
  const selected = AGENT_RUNS.find((run) => run.id === selectedId) ?? runs[0] ?? null;
  const failedCount = AGENT_RUNS.filter((run) => !run.ok).length;

  return (
    <>
      <PageTopbar title="エージェント実行ログ">
        <span className="muted small">
          今月の実行 {RUN_USAGE.monthlyRuns} ・ 合計コスト {RUN_USAGE.monthlyCost}
        </span>
      </PageTopbar>
      <div className="split">
        <section className="pane grow pad-32">
          <p className="mock-note small">サンプルデータを表示しています(実行履歴の記録は準備中)</p>
          <Tabs
            label="実行の絞り込み"
            value={tab}
            onChange={setTab}
            options={[
              { id: "all", label: "すべて" },
              { id: "ideas", label: "アイデア提案" },
              { id: "slides", label: "スライド生成" },
              { id: "failed", label: `失敗 ${failedCount}` }
            ]}
          />
          <div className="table">
            <div className="trow head cols-runs">
              <span>ID</span>
              <span>種別</span>
              <span>対象</span>
              <span>状態</span>
              <span className="right">所要</span>
              <span className="right">コスト</span>
              <span className="right">開始</span>
            </div>
            {runs.map((run) => (
              <button
                key={run.id}
                className={`trow cols-runs${run.id === selected?.id ? " selected" : ""}`}
                onClick={() => {
                  setSelectedId(run.id);
                  setShowIo(false);
                }}
              >
                <span className="muted">{run.id}</span>
                <span>{run.kind}</span>
                <strong>{run.target}</strong>
                <span className={`strong ${run.ok ? "ok-text" : "danger-text"}`}>{run.ok ? "成功" : "失敗"}</span>
                <span className="right">{run.duration}</span>
                <span className="right">{run.cost}</span>
                <span className="right muted">{run.startedAt}</span>
              </button>
            ))}
          </div>
        </section>
        <aside className="pane detail-pane">
          {selected ? (
            <>
              <div className="detail-scroll">
                <span className="eyebrow">実行 {selected.id}</span>
                <h2 className="detail-title">{selected.target}</h2>
                <p className="muted small">モデル: 最新の推論モデル · 合計 {selected.duration}</p>
                <ul className="steps-list small">
                  {RUN_STEPS.map((step) => (
                    <li key={step.name}>
                      <span className={`status-dot ${selected.ok ? "ok" : "wait"}`} />
                      <strong className="grow">{step.name}</strong>
                      <span className="muted">{step.time}</span>
                    </li>
                  ))}
                </ul>
                <div className="note-box roomy">
                  <strong>エージェントの要約</strong>
                  <p className="muted small">{RUN_SUMMARY}</p>
                </div>
                {showIo ? (
                  <pre className="io-box small">{JSON.stringify({ run: selected.id, kind: selected.kind, target: selected.target, steps: RUN_STEPS.length }, null, 2)}</pre>
                ) : null}
              </div>
              <div className="detail-foot row gap-8">
                <button className="btn outline grow" onClick={() => setShowIo((v) => !v)}>
                  入出力を表示
                </button>
                <button className="btn outline grow" onClick={() => notify("再実行は準備中です")}>
                  同じ条件で再実行
                </button>
              </div>
            </>
          ) : (
            <p className="empty">実行を選択してください</p>
          )}
        </aside>
      </div>
    </>
  );
}
