/**
 * MOCK: agent run history, team members and approval rules have no backend yet.
 * Values mirror the design.
 */

export type RunKind = "スライド生成" | "アイデア提案" | "一部再生成";

export interface AgentRunMock {
  readonly id: string;
  readonly kind: RunKind;
  readonly target: string;
  readonly ok: boolean;
  readonly duration: string;
  readonly cost: string;
  readonly startedAt: string;
}

export const AGENT_RUNS: readonly AgentRunMock[] = [
  { id: "#482", kind: "スライド生成", target: "未経験からエンジニア転職", ok: true, duration: "48秒", cost: "¥38", startedAt: "10/26 22:14" },
  { id: "#481", kind: "スライド生成", target: "面接で聞かれる逆質問10選", ok: true, duration: "52秒", cost: "¥41", startedAt: "10/27 06:02" },
  { id: "#480", kind: "アイデア提案", target: "10件を提案", ok: true, duration: "31秒", cost: "¥22", startedAt: "10/26 21:00" },
  { id: "#479", kind: "スライド生成", target: "年収交渉のコツ", ok: false, duration: "2分10秒", cost: "¥29", startedAt: "10/26 20:41" },
  { id: "#478", kind: "一部再生成", target: "残業ゼロ企業の見分け方 スライド5", ok: true, duration: "12秒", cost: "¥6", startedAt: "10/26 19:12" },
  { id: "#477", kind: "アイデア提案", target: "8件を提案", ok: true, duration: "28秒", cost: "¥19", startedAt: "10/25 21:00" },
  { id: "#476", kind: "スライド生成", target: "職務経歴書の書き方 完全版", ok: true, duration: "55秒", cost: "¥43", startedAt: "10/24 22:10" }
];

export const RUN_STEPS: readonly { name: string; time: string }[] = [
  { name: "get_guideline()", time: "0.4秒" },
  { name: "list_references()", time: "0.6秒" },
  { name: "get_memory()", time: "0.5秒" },
  { name: "check_duplicate()", time: "0.8秒" },
  { name: "submit_deck() 8スライド検証OK", time: "21秒" },
  { name: "canva.autofill()", time: "14秒" },
  { name: "canva.export() 8ページ", time: "11秒" }
];

export const RUN_SUMMARY =
  "ガイドラインの「不安を解消する実用ノウハウ」に沿い、過去30日に未使用のテーマを選定。重複チェックは問題なし。";

export const RUN_USAGE = { monthlyRuns: 64, monthlyCost: "¥2,310" } as const;

export type MemberRole = "オーナー" | "編集者" | "閲覧者";

export interface MemberMock {
  readonly name: string;
  readonly initial: string;
  readonly role: MemberRole;
  readonly scope: string;
  readonly lastActive: string;
  readonly pending?: boolean;
  readonly tone: "ink" | "blue" | "gray";
  readonly you?: boolean;
}

export const MEMBERS: readonly MemberMock[] = [
  { name: "運用管理者", initial: "管", role: "オーナー", scope: "すべて", lastActive: "いま", tone: "ink", you: true },
  { name: "編集担当", initial: "編", role: "編集者", scope: "@jobs_recruit_tech", lastActive: "2時間前", tone: "blue" },
  { name: "デザイナー", initial: "デ", role: "編集者", scope: "すべて", lastActive: "昨日", tone: "blue" },
  { name: "外部レビュアー", initial: "外", role: "閲覧者", scope: "@jobs_recruit_tech", lastActive: "—", tone: "gray", pending: true }
];

export const PERMISSIONS: readonly { action: string; owner: boolean; editor: boolean; viewer: boolean }[] = [
  { action: "企画の作成・スライドの編集", owner: true, editor: true, viewer: false },
  { action: "承認・差し戻し", owner: true, editor: false, viewer: false },
  { action: "予約・公開", owner: true, editor: false, viewer: false },
  { action: "アカウント連携・設定の変更", owner: true, editor: false, viewer: false }
];

export const APPROVAL_FLOW: readonly { step: string; title: string; body: string }[] = [
  { step: "STEP 1", title: "AI品質チェック", body: "ガイドライン適合・重複・誤字を自動検査。スコア85未満は自動で差し戻し" },
  { step: "STEP 2", title: "編集担当レビュー", body: "編集者ロールのメンバーが内容を確認。必須設定中。" },
  { step: "STEP 3", title: "オーナー承認", body: "オーナーが最終承認し、公開日時を確定" },
  { step: "STEP 4", title: "予約・自動公開", body: "予約時刻にInstagramへ公開" }
];

export const REVIEW_CHECKS: readonly { label: string; value: string; tone: "ok" | "warn" }[] = [
  { label: "ガイドライン適合", value: "12 / 12", tone: "ok" },
  { label: "過去投稿との重複", value: "問題なし", tone: "ok" },
  { label: "誤字脱字・表記ゆれ", value: "0件", tone: "ok" },
  { label: "求人ロゴの利用許諾(スライド7)", value: "要確認", tone: "warn" }
];

export const REVIEW_COMMENTS: readonly { who: string; text: string }[] = [
  { who: "編集担当", text: "スライド5の「育成枠」に脚注を追加しました。" },
  { who: "AIエージェント", text: "給与レンジは求人票の記載に合わせて丸めています。" }
];

export const NOTIFICATION_SETTINGS: readonly { title: string; body: string; on: boolean }[] = [
  { title: "承認待ちの通知", body: "レビュー待ちの投稿が生成されたらSlackとメールで知らせます", on: true },
  { title: "生成失敗の通知", body: "Canva書き出しなどで生成に失敗したときに通知します", on: true },
  { title: "週次サマリー", body: "毎週月曜朝にパフォーマンスの要約を送ります", on: false }
];

export const BILLING = {
  plan: "チームプラン",
  seats: "4 / 5 席",
  monthlyRuns: "64 回",
  monthlyCost: "¥2,310",
  renewal: "11/15"
} as const;
