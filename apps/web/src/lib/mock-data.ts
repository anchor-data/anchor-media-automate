import type { GenerationStatus } from "@ama/shared";

export type PostStatus = "draft" | "scheduled" | "published";

export interface MockPost {
  readonly id: string;
  readonly accountId: string;
  readonly title: string;
  readonly caption: string;
  readonly status: PostStatus;
  readonly day: number;
  readonly scheduledAt: string | null;
  readonly ideaTarget: string;
  readonly ideaId?: string;
  /** Set for API posts; absent for offline mock drafts. */
  readonly generationStatus?: GenerationStatus;
  readonly generationError?: string | null;
  /** Slide image URLs in page order; undefined until loaded from the API. */
  readonly assetUrls?: readonly string[];
  /** Canva design the slides were rendered from; undefined until loaded from the API. */
  readonly canvaDesignId?: string;
}

export interface MockAccount {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly target: string;
  readonly concept: string;
  readonly schedule: string;
  readonly systemPrompt: string;
  readonly memory: readonly string[];
  readonly ideaQueue: readonly string[];
  /** Canva brand template this account renders with (API accounts only). */
  readonly canvaTemplateId?: string;
}

export interface IdeaCandidate {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "下書き",
  scheduled: "予約済み",
  published: "投稿済み"
};

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;
export const SCHEDULE_OPTIONS = ["毎日 18:00", "毎日 12:00", "平日 9:00", "週3回 (火・木・土)"] as const;
export const DEFAULT_PROMPT =
  "あなたはプロのSNSマーケターです。提供される自社データやテーマに基づき、Demindのテンプレートに従って魅力的なInstagramのカルーセル投稿を企画してください。";

export const INITIAL_ACCOUNTS: readonly MockAccount[] = [
  {
    id: "acc_001",
    handle: "@job_recruit_tech",
    title: "エンジニア転職",
    target: "リモートワーク希望の20-30代エンジニア",
    concept: "モダンエンジニアのためのキャリアアップ術",
    schedule: "毎日 18:00",
    systemPrompt: DEFAULT_PROMPT,
    memory: ["Reactフック", "給与交渉術"],
    ideaQueue: ["リモート面接を成功させる5つのコツ", "2024年必須のReactスキル トップ3"]
  },
  {
    id: "acc_002",
    handle: "@sales_career_up",
    title: "営業キャリアアップ",
    target: "転職を考える20代の営業職",
    concept: "営業スキルを武器にするキャリア設計",
    schedule: "平日 9:00",
    systemPrompt: DEFAULT_PROMPT,
    memory: ["インサイドセールス"],
    ideaQueue: ["未経験から営業マネージャーへ"]
  },
  {
    id: "acc_003",
    handle: "@design_portfolio",
    title: "デザインポートフォリオ",
    target: "デザイナー志望の学生・第二新卒",
    concept: "採用される作品集のつくり方",
    schedule: "毎日 12:00",
    systemPrompt: DEFAULT_PROMPT,
    memory: ["ポートフォリオ構成"],
    ideaQueue: ["作品集の構成テンプレート"]
  }
];

export const KPIS = [
  { label: "月間リーチ数", value: "45,210", delta: "+12%", up: true },
  { label: "投稿保存数", value: "1,204", delta: "+5%", up: true },
  { label: "プロフィールアクセス", value: "342", delta: "-2%", up: false }
] as const;

export const REACH_BY_WEEKDAY = [38, 55, 44, 66, 80, 70, 92] as const;

export const INSIGHTS = [
  "フロントエンド関連の保存率が高いです。Reactの話題を増やしましょう。",
  "日曜の投稿はリーチが下がる傾向にあります。火曜〜木曜に寄せましょう。"
] as const;

export const TOP_POSTS = [
  { title: "モダンエンジニアの職務経歴書", views: "12.4K", saves: "842" },
  { title: "React vs Vue 2024年の動向", views: "9.2K", saves: "610" },
  { title: "給与交渉でやってはいけない事", views: "8.8K", saves: "530" }
] as const;

export function generateIdeas(prompt: string): readonly IdeaCandidate[] {
  const seed = prompt.trim().slice(0, 24) || "新しい企画";
  return [
    {
      id: "idea_a",
      title: `${seed}を3ステップで解説するカルーセル`,
      summary: "駆け出しエンジニア向けに、メリットとデメリットを図解で整理します。"
    },
    {
      id: "idea_b",
      title: "現場でよくある誤解 Top5",
      summary: "保存率が高い「誤解を解く」フォーマットで、5枚構成のカルーセルにします。"
    },
    {
      id: "idea_c",
      title: "先輩エンジニアに聞いた本音Q&A",
      summary: "社内議論をQ&A形式にまとめ、親近感のあるトーンで発信します。"
    }
  ];
}
