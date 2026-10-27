/**
 * MOCK: analytics has no backend yet (Instagram insights are a later phase).
 * Values mirror the design so the screens render realistic content.
 */

export interface KpiMock {
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly up: boolean;
}

export const PERFORMANCE_KPIS: readonly KpiMock[] = [
  { label: "リーチ", value: "182,400", delta: "+12.4%", up: true },
  { label: "保存率", value: "4.8%", delta: "+0.6pt", up: true },
  { label: "プロフィールアクセス", value: "4,206", delta: "+8.1%", up: true },
  { label: "フォロワー増加", value: "+342", delta: "-3.1%", up: false },
  { label: "求人リンククリック", value: "318", delta: "+21%", up: true }
];

export const DAILY_REACH: readonly number[] = [
  3900, 5400, 4000, 6200, 5700, 7100, 7900, 5300, 6000, 6800, 8000, 6100, 12480, 7400
];
export const DAILY_REACH_LABELS: readonly string[] = ["10/14", "10/18", "10/22", "10/27"];

/** Rows: 朝/昼/夜. Columns: 月〜日. Values 0–1 (saved-rate intensity). */
export const POSTING_HEATMAP: readonly (readonly number[])[] = [
  [0.1, 0.12, 0.3, 0.1, 0.3, 0.55, 0.55],
  [0.3, 0.3, 0.55, 0.3, 0.55, 0.75, 1],
  [0.55, 0.75, 0.75, 1, 1, 0.75, 0.55]
];

export interface RankedPostMock {
  readonly id: string;
  readonly title: string;
  readonly reach: string;
  readonly publishedAt: string;
  readonly saveRate: string;
}

export const SAVE_RATE_RANKING: readonly RankedPostMock[] = [
  { id: "p1", title: "年収交渉のコツ", reach: "12,480", publishedAt: "10/21", saveRate: "7.4%" },
  { id: "p2", title: "職務経歴書の書き方 完全版", reach: "9,920", publishedAt: "10/14", saveRate: "6.8%" },
  { id: "p3", title: "面接で聞かれる逆質問10選", reach: "8,310", publishedAt: "10/07", saveRate: "6.1%" },
  { id: "p4", title: "副業OK企業の探し方", reach: "7,050", publishedAt: "10/12", saveRate: "5.5%" },
  { id: "p5", title: "志望動機の作り方", reach: "6,820", publishedAt: "10/14", saveRate: "5.2%" }
];

export const AI_INSIGHT =
  "「お金・年収」系の話題は保存率が平均より +2.1pt 高い傾向です。来週は同系統の企画を2本、金曜夜の枠に入れることを提案します。";

export interface PostInsightMock {
  readonly tag: string;
  readonly tone: "warn" | "idea" | "next";
  readonly title: string;
  readonly body: string;
}

export const POST_DETAIL = {
  title: "年収交渉で損しない人の3つの共通点",
  publishedAt: "10/21(火) 19:00",
  kind: "ノウハウ 8枚",
  template: "ダーク始まり",
  approver: "運用管理者",
  metrics: [
    { label: "リーチ", value: "12,480", accent: false },
    { label: "保存", value: "924", accent: true },
    { label: "シェア", value: "312", accent: false },
    { label: "フォロー獲得", value: "86", accent: false }
  ],
  reach: [
    { label: "1 フック", value: 100 },
    { label: "2 課題", value: 82 },
    { label: "3 要点1", value: 71 },
    { label: "4 要点2", value: 64 },
    { label: "5 要点3", value: 52 },
    { label: "6 要点4", value: 47 },
    { label: "7 求人", value: 38 },
    { label: "8 CTA", value: 31 }
  ],
  insights: [
    {
      tag: "スライド7",
      tone: "warn",
      title: "求人ピックの前に「次のスライドで紹介」と予告する",
      body: "求人スライドで到達率が-9pt。他の投稿では予告があると離脱が1pt台に留まっています。"
    },
    {
      tag: "フック",
      tone: "idea",
      title: "具体的な金額を入れたフックを試す",
      body: "「年収+80万円」のように数字を含む投稿は保存率が+1.9pt。"
    },
    {
      tag: "続編",
      tone: "next",
      title: "「面接での年収の聞かれ方」を続編にする",
      body: "保存数が多く、関連トピックの需要が見込めます。"
    }
  ] as readonly PostInsightMock[]
} as const;

export interface BenchmarkRowMock {
  readonly account: string;
  readonly own: boolean;
  readonly followers: string;
  readonly weekly: string;
  readonly saveRate: string;
  readonly engagement: string;
  readonly growth: string;
  readonly growthUp: boolean;
  readonly best?: boolean;
}

export const BENCHMARK_ROWS: readonly BenchmarkRowMock[] = [
  { account: "@jobs_recruit_tech(自社)", own: true, followers: "12.4K", weekly: "5.0本", saveRate: "4.8%", engagement: "3.9%", growth: "+2.8%", growthUp: true },
  { account: "@career_note_it", own: false, followers: "48.2K", weekly: "7.0本", saveRate: "3.1%", engagement: "2.4%", growth: "+1.1%", growthUp: true },
  { account: "@tenshoku_lab", own: false, followers: "31.5K", weekly: "4.5本", saveRate: "5.2%", engagement: "4.1%", growth: "+0.4%", growthUp: true, best: true },
  { account: "@it_job_navi", own: false, followers: "22.9K", weekly: "10.0本", saveRate: "2.2%", engagement: "1.8%", growth: "-0.3%", growthUp: false },
  { account: "@engineer_gate", own: false, followers: "9.8K", weekly: "3.0本", saveRate: "3.7%", engagement: "3.0%", growth: "+4.2%", growthUp: true }
];

export const FORMAT_SAVE_RATES: readonly { label: string; own: number; rival: number }[] = [
  { label: "カルーセル", own: 4.9, rival: 4.0 },
  { label: "リール", own: 1.8, rival: 2.4 },
  { label: "単枚画像", own: 1.2, rival: 1.3 }
];

export const RIVAL_POSTS: readonly { meta: string; title: string; hook: string }[] = [
  { meta: "@tenshoku_lab · カルーセル 9枚 · 保存 2.1K", title: "「内定が出ない人」が面接前にやっていない3つのこと", hook: "フック型: 否定+数字 / 1枚目に結論を置かない構成" },
  { meta: "@engineer_gate · カルーセル 7枚 · 保存 1.4K", title: "年収600万を超えたエンジニアの職務経歴書", hook: "フック型: 実例開示 / 最終スライドで保存を促す" },
  { meta: "@career_note_it · リール · 保存 980", title: "面接官が本当に見ている逆質問の意図", hook: "フック型: 裏側開示 / 15秒でテンポよく" }
];
