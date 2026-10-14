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
}

export interface MockAccount {
  readonly id: string;
  readonly handle: string;
  readonly target: string;
  readonly concept: string;
  readonly schedule: string;
  readonly systemPrompt: string;
  readonly memory: readonly string[];
  readonly ideaQueue: readonly string[];
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

const REMOTE_CAPTION = `リモート面接を成功させたいですか？

1. バーチャルホワイトボードを使いこなす
2. 思考プロセスを言語化する
3. 個人プロジェクトをアピールする

#RemoteWork #FrontendDev`;

export const INITIAL_ACCOUNTS: readonly MockAccount[] = [
  {
    id: "acc_001",
    handle: "@job_recruit_tech",
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
    target: "デザイナー志望の学生・第二新卒",
    concept: "採用される作品集のつくり方",
    schedule: "毎日 12:00",
    systemPrompt: DEFAULT_PROMPT,
    memory: ["ポートフォリオ構成"],
    ideaQueue: ["作品集の構成テンプレート"]
  }
];

export const INITIAL_POSTS: readonly MockPost[] = [
  {
    id: "post_001",
    accountId: "acc_001",
    title: "リモート面接を成功させる5つのコツ",
    caption: REMOTE_CAPTION,
    status: "scheduled",
    day: 14,
    scheduledAt: "2026/02/14 18:00",
    ideaTarget: "20-30代リモート希望エンジニア"
  },
  {
    id: "post_002",
    accountId: "acc_001",
    title: "React tips: useStateの落とし穴",
    caption: "useStateでハマりがちな3つの落とし穴を解説します。\n\n#React #Frontend",
    status: "scheduled",
    day: 16,
    scheduledAt: "2026/02/16 19:00",
    ideaTarget: "駆け出しフロントエンドエンジニア"
  },
  {
    id: "post_003",
    accountId: "acc_001",
    title: "2024年必須のReactスキル トップ3",
    caption: "2024年に身につけたいReactスキルを3つ厳選しました。\n\n#React #Career",
    status: "draft",
    day: 20,
    scheduledAt: null,
    ideaTarget: "転職を考えるフロントエンドエンジニア"
  },
  {
    id: "post_004",
    accountId: "acc_001",
    title: "エンジニアの給与交渉術",
    caption: "年収アップのための交渉ステップをまとめました。\n\n#給与交渉 #転職",
    status: "published",
    day: 10,
    scheduledAt: "2026/02/10 18:00",
    ideaTarget: "20-30代エンジニア"
  },
  {
    id: "post_005",
    accountId: "acc_002",
    title: "未経験から営業マネージャーへ",
    caption: "営業職からマネージャーに進むための3ステップ。\n\n#営業 #キャリア",
    status: "scheduled",
    day: 12,
    scheduledAt: "2026/02/12 9:00",
    ideaTarget: "20代の営業職"
  },
  {
    id: "post_006",
    accountId: "acc_003",
    title: "作品集の構成テンプレート",
    caption: "採用担当に刺さるポートフォリオの並べ方を紹介します。\n\n#デザイン #ポートフォリオ",
    status: "draft",
    day: 18,
    scheduledAt: null,
    ideaTarget: "デザイナー志望の学生"
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
