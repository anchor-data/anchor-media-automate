"use client";

import Link from "next/link";
import { useState } from "react";
import { AUTO_RUN_SCHEDULES } from "@ama/shared";
import { AgentProfileForm } from "../agent-profile-form";
import { CanvaTemplateSelect } from "../canva-template-select";
import { Icon } from "../icon";
import { PageTopbar, Switch, Tabs } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { canvaTemplateUrl } from "../../lib/canva";

type SideTab = "agent" | "profile" | "instagram";

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
  // The sidebar opens only after an account is picked from the list.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = accounts.find((a) => a.id === selectedId) ?? null;
  const [tab, setTab] = useState<SideTab>("agent");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [savingRun, setSavingRun] = useState(false);

  const pickedTemplate = templateId ?? active?.canvaTemplateId ?? "";
  const instagramConnected = integrations?.instagram ?? false;

  /** Opening an account always starts on the エージェント設定 tab. */
  const selectAccount = (id: string) => {
    setActiveAccountId(id);
    setSelectedId(id);
    setTemplateId(null);
    setTab("agent");
  };

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
              <p className="muted small">アカウントを選ぶと、右側でエージェント設定・ペルソナ・ガイドライン・Instagram連携を管理できます</p>
            </div>
          </div>
          {accounts.length === 0 ? (
            <p className="empty">アカウントがありません。「アカウントを追加」から作成してください。</p>
          ) : (
            <ul className="account-table">
              {accounts.map((account) => {
                const isActive = account.id === selectedId;
                return (
                  <li key={account.id} className={isActive ? "active" : undefined}>
                    <button
                      className="account-row-btn"
                      aria-pressed={isActive}
                      onClick={() => selectAccount(account.id)}
                    >
                      <span className="avatar lg">{account.handle.replace("@", "").slice(0, 1).toUpperCase()}</span>
                      <span className="stack gap-2 grow account-name">
                        <strong className="ellipsis">{account.handle}</strong>
                        <span className="muted small ellipsis">
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
                      <span className="link small">
                        {isActive ? "選択中" : "設定"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {active ? (
        <aside className="pane detail-pane wide-detail" aria-label="アカウント設定">
          <>
              <div className="pad-tabs">
                <div className="row between pad-b-8">
                  <span className="eyebrow">{active.handle}</span>
                  <button className="icon-btn" aria-label="設定を閉じる" onClick={() => setSelectedId(null)}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
                <Tabs
                  label="アカウント設定"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { id: "agent", label: "エージェント設定" },
                    { id: "profile", label: "ペルソナ・ガイドライン" },
                    { id: "instagram", label: "Instagram連携" }
                  ]}
                />
              </div>
              <div className="detail-scroll">
                {tab === "agent" ? (
                  <div className="stack gap-24">
                    <div className="stack gap-8">
                      <div className="row gap-12">
                        <Switch
                          label="定期実行を有効にする"
                          checked={active.autoRunEnabled ?? false}
                          disabled={!apiReady || savingRun}
                          onChange={(on) => void updateAutoRun(on, active.schedule)}
                        />
                        <strong className="grow">定期実行(アイデア+コンテンツ自動生成)</strong>
                      </div>
                      <select
                        className="select"
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
                      {!apiReady ? <p className="muted small">API未接続のため定期実行は利用できません</p> : null}
                    </div>
                    {apiReady ? (
                      <div className="stack gap-8">
                        <strong>Canvaテンプレート</strong>
                        <CanvaTemplateSelect value={pickedTemplate} onChange={setTemplateId} disabled={applying} />
                        <div className="row gap-12">
                          <button
                            className="btn outline sm"
                            disabled={applying || !pickedTemplate || pickedTemplate === active.canvaTemplateId}
                            onClick={() => void applyTemplate()}
                          >
                            {applying ? "検証中…" : "テンプレートを適用"}
                          </button>
                          {active.canvaTemplateId ? (
                            <a className="link small" href={canvaTemplateUrl(active.canvaTemplateId)} target="_blank" rel="noreferrer">
                              Canvaで開く
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="stack gap-8">
                      <div className="row between">
                        <strong>メモリー(重複防止)</strong>
                        <Link className="link small" href="/guidelines">
                          参照資料・メモリ
                        </Link>
                      </div>
                      <span className="tags">
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
                ) : null}

                {tab === "profile" ? <AgentProfileForm /> : null}

                {tab === "instagram" ? (
                  <div className="stack gap-8">
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
                ) : null}
              </div>
              {tab === "instagram" ? (
                <div className="detail-foot stack gap-8">
                  <button className="btn primary block" onClick={() => notify("Instagram連携はまだ利用できません(モック)")}>
                    Facebookで認証する
                  </button>
                  <p className="muted small center">パスワードはこのシステムに保存されません。認証はいつでも取り消せます。</p>
                </div>
              ) : null}
          </>

        </aside>
        ) : null}
      </div>
    </>
  );
}
