"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AUTO_RUN_SCHEDULES } from "@ama/shared";
import { AccountDesignCard } from "../design/account-design-card";
import { AgentProfileForm } from "../agent-profile-form";
import { Icon } from "../icon";
import { useInstagramConnection } from "../use-instagram-connection";
import { PageTopbar, Switch, Tabs } from "../ui/page";
import { useWorkspace } from "../workspace-context";

type SideTab = "agent" | "profile" | "instagram";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const STEPS = ["Instagramでログインして許可", "接続されたアカウントを確認", "ガイドラインとデザインを設定"] as const;

const CALLBACK_ERRORS: Readonly<Record<string, string>> = {
  denied: "Instagramでの許可がキャンセルされました",
  invalid_state: "認証の有効期限が切れました。もう一度お試しください",
  exchange_failed: "Instagramとの連携に失敗しました。プロアカウントか確認してください",
  not_configured: "Instagramアプリの設定がAPIにありません",
  account_not_found: "アカウントが見つかりません"
};

export function AgentAccountsPage() {
  const {
    accounts,
    activeAccountId,
      guideline,
    memoryItems,
    apiReady,
    openModal,
    saveAutoRun,
    removeMemory,
    notify
  } = useWorkspace();
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0] ?? null;
  const [tab, setTab] = useState<SideTab>("agent");
  const [savingRun, setSavingRun] = useState(false);

  const instagram = useInstagramConnection(active?.id ?? null, apiReady);
  const instagramConnected = instagram.status.connected;
  const [instagramBusy, setInstagramBusy] = useState(false);

  // Result of the Instagram redirect arrives as ?instagram=connected|error&reason=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("instagram");
    if (!result) return;
    setTab("instagram");
    notify(result === "connected" ? "Instagramを連携しました" : (CALLBACK_ERRORS[params.get("reason") ?? ""] ?? "Instagramの連携に失敗しました"));
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runInstagram = async (action: () => Promise<void>, failure: string) => {
    setInstagramBusy(true);
    try {
      await action();
    } catch (error) {
      notify(errorText(error, failure));
    } finally {
      setInstagramBusy(false);
    }
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

  return (
    <>
      <PageTopbar title="アカウント管理">
        <button className="btn primary" onClick={() => openModal({ kind: "add-account" })}>
          <Icon name="plus" size={14} />
          アカウントを追加
        </button>
      </PageTopbar>
      <div className="split">
        <section className="pane grow pad-32">
          {!active ? (
            <p className="empty">アカウントがありません。「アカウントを追加」から作成してください。</p>
          ) : (
            <div className="stack gap-16" style={{ maxWidth: 720 }}>
              <div className="page-head tight">
                <div>
                  <h1>{active.handle}</h1>
                  <p className="muted small">
                    {active.title} · 別のアカウントは左上のメニューで切り替えます
                    <span className={`small ${instagramConnected ? "ok-text" : "warn-text"}`}>{" · "}Instagram {instagramConnected ? "接続済み" : "未接続"}</span>
                    {guideline ? ` · ガイドライン v${guideline.version}` : ""}
                  </p>
                </div>
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
              <div>
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
                    <AccountDesignCard accountId={active.id} />
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
                    <span className="eyebrow">投稿の予約</span>
                    <h2 className="detail-title">Instagram と連携する</h2>
                    {instagramConnected ? (
                      <div className="note-box roomy">
                        <strong>@{instagram.status.username} と接続済み</strong>
                        <p className="small muted">
                          承認済みの投稿は、予約した時刻に自動で投稿されます。
                          {instagram.status.expiresAt ? ` 認証は ${instagram.status.expiresAt.slice(0, 10)} まで有効で、自動的に更新されます。` : ""}
                        </p>
                      </div>
                    ) : (
                      <>
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
                            <li>必要な権限は「投稿の公開」と「プロフィールの閲覧」のみです</li>
                            <li>アプリが開発モードの間は、Metaのテスターに追加したアカウントのみ連携できます</li>
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
              {tab === "instagram" ? (
                <div className="stack gap-8">
                  {instagramConnected ? (
                    <button
                      className="btn block"
                      disabled={instagramBusy}
                      onClick={() =>
                        void runInstagram(async () => {
                          await instagram.disconnect();
                          notify("Instagramの連携を解除しました");
                        }, "解除に失敗しました")
                      }
                    >
                      連携を解除する
                    </button>
                  ) : (
                    <button
                      className="btn primary block"
                      disabled={!apiReady || !instagram.configured || instagramBusy}
                      onClick={() => void runInstagram(instagram.connect, "連携を開始できませんでした")}
                    >
                      Instagramで認証する
                    </button>
                  )}
                  {apiReady && !instagram.configured && !instagram.loading ? (
                    <p className="muted small center">APIに INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET が設定されていません</p>
                  ) : (
                    <p className="muted small center">パスワードはこのシステムに保存されません。認証はいつでも取り消せます。</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
