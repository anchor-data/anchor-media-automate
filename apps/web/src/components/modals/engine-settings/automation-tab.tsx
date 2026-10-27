"use client";

import { canvaTemplateUrl } from "../../../lib/canva";
import { SCHEDULE_OPTIONS } from "../../../lib/mock-data";
import { CanvaTemplateSelect } from "../../canva-template-select";
import { useWorkspace } from "../../workspace-context";

interface AutomationTabProps {
  readonly accountId: string;
  readonly autoRun: boolean;
  readonly schedule: string;
  readonly templateId: string;
  readonly applyingTemplate: boolean;
  readonly onAutoRun: (value: boolean) => void;
  readonly onSchedule: (value: string) => void;
  readonly onTemplateId: (value: string) => void;
  readonly onApplyTemplate: () => void;
}

/** Scheduled runs, Canva template and the dedupe memory. */
export function AutomationTab(props: AutomationTabProps) {
  const { accounts, memoryItems, removeMemory, notify, apiReady } = useWorkspace();
  const account = accounts.find((a) => a.id === props.accountId);
  if (!account) return null;

  return (
    <div className="stack gap-16">
      <div className="tile stack gap-8">
        <span className="label">定期実行（アイデア＋コンテンツ自動生成）</span>
        <label className="row gap-8">
          <input
            type="checkbox"
            role="switch"
            aria-label="定期実行を有効にする"
            checked={props.autoRun}
            disabled={!apiReady}
            onChange={(e) => props.onAutoRun(e.target.checked)}
          />
          <span>{props.autoRun ? "有効" : "無効"}</span>
        </label>
        {!apiReady ? <span className="muted small">API未接続のため定期実行は利用できません</span> : null}
        <select
          className="select"
          aria-label="投稿生成スケジュール"
          value={props.schedule}
          disabled={!props.autoRun}
          onChange={(e) => props.onSchedule(e.target.value)}
        >
          {SCHEDULE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.startsWith("毎日") ? `${option} に自動生成` : option}
            </option>
          ))}
        </select>
      </div>
      {apiReady ? (
        <div className="tile stack gap-8">
          <span className="label">Canvaテンプレート</span>
          <CanvaTemplateSelect value={props.templateId} onChange={props.onTemplateId} disabled={props.applyingTemplate} />
          <button
            className="btn outline"
            type="button"
            disabled={props.applyingTemplate || !props.templateId || props.templateId === account.canvaTemplateId}
            onClick={props.onApplyTemplate}
          >
            {props.applyingTemplate ? "検証中…" : "テンプレートを適用"}
          </button>
          <span className="muted small">s1_title〜s8_cta の21項目が必要です。不足があると適用できません。</span>
          {account.canvaTemplateId ? (
            <a className="small" href={canvaTemplateUrl(account.canvaTemplateId)} target="_blank" rel="noreferrer">
              Canvaで適用中のテンプレートを開く
            </a>
          ) : null}
        </div>
      ) : null}
      <div className="tile stack gap-8">
        <span className="label">メモリーシステム (重複防止)</span>
        <div className="tags">
          {memoryItems.length === 0 ? (
            <span className="muted small">まだ記録がありません</span>
          ) : (
            memoryItems.map((m) => (
              <button
                type="button"
                className="tag"
                key={m.id}
                title="クリックで削除"
                onClick={() => {
                  void removeMemory(m.id).then(() => notify("メモリーを削除しました"));
                }}
              >
                {m.topicKey}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
