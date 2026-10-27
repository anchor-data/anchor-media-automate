"use client";

import Link from "next/link";
import { useState } from "react";
import { AUTO_RUN_SCHEDULES } from "@ama/shared";
import { CanvaTemplateSelect } from "../canva-template-select";
import { Icon } from "../icon";
import { PageTopbar, Switch } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { canvaTemplateUrl } from "../../lib/canva";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const STEPS = ["Facebookページで認証", "Instagramプロアカウントを選ぶ", "ガイドラインとテンプレートを設定"] as const;

export function AgentAccountsPage() {
  const {
    accounts,
    activeAccountId,
    setActiveAccountId,
    guideline,
    memoryItems,
    integrations,
    apiReady,
    openModal,
    saveAutoRun,
    saveCanvaTemplate,
    removeMemory,
    notify
  } = useWorkspace();
  const active = accounts.find((a) => a.id === activeAccountId) ?? null;
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [savingRun, setSavingRun] = useState(false);

  const pickedTemplate = templateId ?? active?.canvaTemplateId ?? "";
  const instagramConnected = integrations?.instagram ?? false;

  const updateAutoRun = async (enabled: boolean, schedule: string) => {
    if (!active) return;
    setSavingRun(true);
    try {
      await saveAutoRun(active.id, enabled, schedule);
      notify(enabled ? "定期実行を有効にしました" : "定期実行を無効にしました");
    } catch (error) {
      notify(errorText(error, "保存に失敗しました"));
    } finally {
      setSavingRun(false);
    }
  };

  const applyTemplate = async () => {
    if (!active) return;
    setApplying(true);
    try {
      await saveCanvaTemplate(active.id, pickedTemplate);
      setTemplateId(null);
      notify("テンプレートを適用しました");
    } catch (error) {
      notify(errorText(error, "テンプレートの適用に失敗しました"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <PageTopbar title="アカウント">
        <button className="btn primary" onClick={() => openModal({ kind: "add-account" })}>
          <Icon name="plus" size={14} />
          アカウントを追加
        </button>
      </PageTopbar>
      <div className="split">
        <section className="pane grow pad-32">
          <div className="page-head tight">
            <div>
              <h1>運用アカウント</h1>
              <p className="muted small">アカウントごとに、ガイドライン・テンプレート・投稿頻度を独立して管理します</p>
            </div>
          </div>
          <ul className="account-table">
            {accounts.map((account) => {
              const isActive = account.id === activeAccountId;
              return (
                <li key={account.id} className={isActive ? "active" : undefined}>
                  <span className="avatar lg">{account.handle.replace("@", "").slice(0, 1).toUpperCase()}</span>
                  <span className="stack gap-2 grow">
                    <strong>{account.handle}</strong>
                    <span className="muted small">
                      {account.title} · {account.schedule}
                    </span>
                  </span>
                  <span className="stack gap-2 col-status">
                    {/* MOCK: per-account token state; the API only reports whether Instagram credentials exist. */}
                    <strong className={`small ${instagramConnected ? "ok-text" : "warn-text"}`}>
                      {instagramConnected ? "接続済み" : "未接続"}
                    </strong>
                    <span className="muted small">{instagramConnected ? "トークン期限 あと54日" : "公開はできません"}</span>
                  </span>
                  <span className="stack gap-2 col-guide">
                    <strong className="small">ガイドライン {isActive && guideline ? `v${guideline.version}` : "—"}</strong>
                    <span className="muted small">{account.canvaTemplateId ? "テンプレート設定済み" : "未設定"}</span>
                  </span>
                  <button className="link small" onClick={() => setActiveAccountId(account.id)}>
                    {isActive ? "選択中" : "設定"}
                  </button>
                </li>
              );
            })}
          </ul>

          {active ? (
            <div className="note-box roomy settings-panel">
              <div className="row between">
                <strong>{active.handle} のエージェント設定</strong>
                <span className="small row gap-8">
                  <Link className="link" href="/guidelines">
                    基本 / 参照
                  </Link>
                  <Link className="link" href="/assets">
                    画像
                  </Link>
                </span>
              </div>
              <div className="setting-row">
                <Switch
                  label="定期実行を有効にする"
                  checked={active.autoRunEnabled ?? false}
                  disabled={!apiReady || savingRun}
                  onChange={(on) => void updateAutoRun(on, active.schedule)}
                />
                <span className="grow">定期実行(アイデア+コンテンツ自動生成)</span>
                <select
                  className="select auto"
                  aria-label="投稿生成スケジュール"
                  value={active.schedule}
                  disabled={!apiReady || savingRun || !active.autoRunEnabled}
                  onChange={(e) => void updateAutoRun(true, e.target.value)}
                >
                  {AUTO_RUN_SCHEDULES.map((option) => (
                    <option key={option} value={option}>
                      {option.startsWith("毎日") ? `${option} に自動生成` : option}
                    </option>
                  ))}
                </select>
              </div>
              {!apiReady ? <p className="muted small">API未接続のため定期実行は利用できません</p> : null}
              {apiReady ? (
                <div className="setting-row">
                  <span className="muted setting-label">Canvaテンプレート</span>
                  <span className="grow">
                    <CanvaTemplateSelect value={pickedTemplate} onChange={setTemplateId} disabled={applying} />
                  </span>
                  <button
                    className="btn outline sm"
                    disabled={applying || !pickedTemplate || pickedTemplate === active.canvaTemplateId}
                    onClick={() => void applyTemplate()}
                  >
                    {applying ? "検証中…" : "適用"}
                  </button>
                  {active.canvaTemplateId ? (
                    <a className="link small" href={canvaTemplateUrl(active.canvaTemplateId)} target="_blank" rel="noreferrer">
                      Canvaで開く
                    </a>
                  ) : null}
                </div>
              ) : null}
              <div className="setting-row top">
                <span className="muted setting-label">メモリー(重複防止)</span>
                <span className="tags grow">
                  {memoryItems.length === 0 ? (
                    <span className="muted small">まだ記録がありません</span>
                  ) : (
                    memoryItems.slice(0, 12).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="tag"
                        title="クリックで削除"
                        onClick={() =>
                          void removeMemory(item.id)
                            .then(() => notify("メモリーを削除しました"))
                            .catch((error: unknown) => notify(errorText(error, "削除に失敗しました")))
                        }
                      >
                        {item.topicKey} <Icon name="x" size={10} />
                      </button>
                    ))
                  )}
                </span>
              </div>
            </div>
          ) : (
            <p className="empty">アカウントがありません。「アカウントを追加」から作成してください。</p>
          )}
        </section>

        <aside className="pane detail-pane">
          <div className="detail-scroll">
            <span className="eyebrow">アカウントを追加</span>
            <h2 className="detail-title">Instagram と連携する</h2>
            {/* MOCK: Instagram OAuth is a later phase; the steps describe the planned flow. */}
            <ol className="step-list">
              {STEPS.map((step, i) => (
                <li key={step} className={i === 0 ? "current" : undefined}>
                  <span className="step-no">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="note-box roomy">
              <strong>連携の前に確認してください</strong>
              <ul className="bullets small muted">
                <li>Instagramがプロアカウント(ビジネス/クリエイター)であること</li>
                <li>Facebookページと紐づけ済みであること</li>
                <li>必要な権限は「投稿の公開」と「インサイトの閲覧」のみです</li>
              </ul>
            </div>
          </div>
          <div className="detail-foot stack gap-8">
            <button className="btn primary block" onClick={() => notify("Instagram連携はまだ利用できません(モック)")}>
              Facebookで認証する
            </button>
            <p className="muted small center">パスワードはこのシステムに保存されません。認証はいつでも取り消せます。</p>
          </div>
        </aside>
      </div>
    </>
  );
}
