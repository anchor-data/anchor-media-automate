"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { PageTopbar, Switch } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import {
  APPROVAL_FLOW,
  BILLING,
  MEMBERS,
  NOTIFICATION_SETTINGS,
  PERMISSIONS
} from "../../lib/mock-ops";

/** MOCK: members, permissions, approval rules, notifications and billing have no backend yet. */

const DASH = "—";

export function MembersPage() {
  const { notify } = useWorkspace();
  return (
    <>
      <PageTopbar title="メンバーと権限">
        <button className="btn primary" onClick={() => notify("メンバー招待は準備中です")}>
          <Icon name="plus" size={14} />
          メンバーを招待
        </button>
      </PageTopbar>
      <div className="page-body pad-32">
        <div className="page-head tight">
          <div>
            <h1>メンバーと権限</h1>
            <p className="muted small">誰が企画・編集・承認・公開できるかを、役割ごとに決めます</p>
          </div>
        </div>
        <p className="mock-note small">サンプルデータを表示しています(アカウント権限管理は準備中)</p>
        <div className="table">
          <div className="trow head cols-members">
            <span>メンバー</span>
            <span>役割</span>
            <span>担当アカウント</span>
            <span>最終操作</span>
          </div>
          {MEMBERS.map((member) => (
            <div className="trow cols-members static" key={member.name}>
              <span className="row gap-12">
                <span className={`avatar ${member.tone}`}>{member.initial}</span>
                <strong>
                  {member.name}
                  {member.you ? "(あなた)" : ""}
                </strong>
                {member.pending ? <span className="warn-text small">招待中</span> : null}
              </span>
              <span>{member.role}</span>
              <span className="muted">{member.scope}</span>
              <span className="muted">{member.lastActive}</span>
            </div>
          ))}
        </div>
        <h3 className="section-title pad-t-24">権限の一覧</h3>
        <div className="table">
          <div className="trow head cols-perms">
            <span>操作</span>
            <span className="center">オーナー</span>
            <span className="center">編集者</span>
            <span className="center">閲覧者</span>
          </div>
          {PERMISSIONS.map((perm) => (
            <div className="trow cols-perms static" key={perm.action}>
              <span>{perm.action}</span>
              {[perm.owner, perm.editor, perm.viewer].map((allowed, i) => (
                <span className="center" key={i}>
                  {allowed ? <span className="perm-dot" aria-label="可" /> : <span className="muted">{DASH}</span>}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

interface RuleDef {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly initial: boolean;
}

const RULES: readonly RuleDef[] = [
  { id: "editor", title: "編集担当のレビューを必須にする", body: "オーナー承認の前に1段階のレビューを挟みます", initial: true },
  { id: "auto", title: "自動公開(承認後に自動で投稿)", body: "オフの場合は予約時刻に手動で公開します", initial: false },
  { id: "remind", title: "公開24時間前のリマインド", body: "未承認の投稿があれば、Slackとメールでオーナーに通知します", initial: true }
];

export function ApprovalRulesPage() {
  const { notify } = useWorkspace();
  const [rules, setRules] = useState<Readonly<Record<string, boolean>>>(() =>
    Object.fromEntries(RULES.map((rule) => [rule.id, rule.initial]))
  );
  const [score, setScore] = useState("85");
  const [deadline, setDeadline] = useState("24");

  return (
    <>
      <PageTopbar title="承認ルール">
        <button className="btn primary" onClick={() => notify("承認ルールを保存しました(サンプル)")}>
          変更を保存
        </button>
      </PageTopbar>
      <div className="page-body pad-32">
        <div className="page-head tight">
          <div>
            <h1>承認ルール</h1>
            <p className="muted small">公開までの承認フローと、自動で差し戻す・公開する条件を決めます。変更はこのアカウントの新規投稿から適用されます</p>
          </div>
        </div>
        <p className="mock-note small">サンプル設定です(承認ルールの保存は準備中)</p>
        <h3 className="section-title">承認フロー</h3>
        <ol className="flow-cards">
          {APPROVAL_FLOW.map((step, i) => (
            <li key={step.step} className={i === 2 ? "current" : undefined}>
              <span className="eyebrow plain">{step.step}</span>
              <strong>{step.title}</strong>
              <p className="muted small">{step.body}</p>
            </li>
          ))}
        </ol>
        <h3 className="section-title pad-t-24">ルール設定</h3>
        <ul className="rule-list">
          {RULES.map((rule) => (
            <li key={rule.id}>
              <span className="stack gap-2 grow">
                <strong>{rule.title}</strong>
                <span className="muted small">{rule.body}</span>
              </span>
              <Switch
                label={rule.title}
                checked={rules[rule.id] ?? false}
                onChange={(on) => setRules((current) => ({ ...current, [rule.id]: on }))}
              />
            </li>
          ))}
          <li>
            <span className="stack gap-2 grow">
              <strong>AI品質スコアの差し戻しライン</strong>
              <span className="muted small">このスコア未満の投稿は、レビューに進まず自動で再生成します</span>
            </span>
            <select className="select auto" aria-label="差し戻しライン" value={score} onChange={(e) => setScore(e.target.value)}>
              {["75", "80", "85", "90"].map((v) => (
                <option key={v} value={v}>
                  {v}点
                </option>
              ))}
            </select>
          </li>
          <li>
            <span className="stack gap-2 grow">
              <strong>承認の期限</strong>
              <span className="muted small">期限を過ぎた投稿は「承認待ち」の上位に表示します</span>
            </span>
            <select className="select auto" aria-label="承認の期限" value={deadline} onChange={(e) => setDeadline(e.target.value)}>
              {["12", "24", "48"].map((v) => (
                <option key={v} value={v}>
                  公開の{v}時間前
                </option>
              ))}
            </select>
          </li>
        </ul>
      </div>
    </>
  );
}

const INTEGRATION_ROWS: readonly { key: string; name: string; body: string }[] = [
  { key: "canva", name: "Canva", body: "ブランドテンプレートへの差し込みと画像の書き出し" },
  { key: "openai", name: "OpenAI", body: "企画の提案とスライド文章の生成" },
  { key: "instagram", name: "Instagram Graph API", body: "予約投稿とインサイトの取得" }
];

export function IntegrationsPage() {
  const { integrations, dataStore, apiReady } = useWorkspace();
  return (
    <>
      <PageTopbar title="外部サービス連携" />
      <div className="page-body pad-32">
        <div className="page-head tight">
          <div>
            <h1>外部サービス連携</h1>
            <p className="muted small">APIに設定されている認証情報から接続状態を表示しています</p>
          </div>
        </div>
        <ul className="rule-list">
          {INTEGRATION_ROWS.map((row) => {
            const connected = integrations?.[row.key] ?? false;
            return (
              <li key={row.key}>
                <span className="stack gap-2 grow">
                  <strong>{row.name}</strong>
                  <span className="muted small">{row.body}</span>
                </span>
                <span className={`pill ${connected ? "ok" : "off"}`}>{connected ? "接続済み" : "未接続"}</span>
              </li>
            );
          })}
          <li>
            <span className="stack gap-2 grow">
              <strong>データストア</strong>
              <span className="muted small">企画・投稿・ガイドラインの保存先</span>
            </span>
            <span className={`pill ${apiReady ? "ok" : "off"}`}>{apiReady ? (dataStore ?? "接続済み") : "オフライン"}</span>
          </li>
        </ul>
      </div>
    </>
  );
}

export function NotificationsPage() {
  const [state, setState] = useState<Readonly<Record<string, boolean>>>(() =>
    Object.fromEntries(NOTIFICATION_SETTINGS.map((item) => [item.title, item.on]))
  );
  return (
    <>
      <PageTopbar title="通知" />
      <div className="page-body pad-32">
        <div className="page-head tight">
          <div>
            <h1>通知</h1>
            <p className="muted small">どのタイミングで誰に知らせるかを決めます</p>
          </div>
        </div>
        <p className="mock-note small">サンプル設定です(通知の送信は準備中)</p>
        <ul className="rule-list">
          {NOTIFICATION_SETTINGS.map((item) => (
            <li key={item.title}>
              <span className="stack gap-2 grow">
                <strong>{item.title}</strong>
                <span className="muted small">{item.body}</span>
              </span>
              <Switch
                label={item.title}
                checked={state[item.title] ?? false}
                onChange={(on) => setState((current) => ({ ...current, [item.title]: on }))}
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function BillingPage() {
  const rows: readonly { label: string; value: string }[] = [
    { label: "プラン", value: BILLING.plan },
    { label: "メンバー", value: BILLING.seats },
    { label: "今月のエージェント実行", value: BILLING.monthlyRuns },
    { label: "今月の合計コスト", value: BILLING.monthlyCost },
    { label: "次回更新日", value: BILLING.renewal }
  ];
  return (
    <>
      <PageTopbar title="請求とプラン" />
      <div className="page-body pad-32">
        <div className="page-head tight">
          <div>
            <h1>請求とプラン</h1>
            <p className="muted small">現在のプランと利用状況</p>
          </div>
        </div>
        <p className="mock-note small">サンプルデータを表示しています(請求連携は準備中)</p>
        <dl className="facts roomy-facts">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
