import type { Account, Guideline, Idea, Job, MemoryItem, Post, PostAsset, Reference } from "@ama/shared";

const nowIso = () => new Date().toISOString();

/** Starter account + human-style guideline/references inspired by わかる転職 structure (not a clone). */
export function createPhase1Seed() {
  const t = nowIso();
  const account: Account = {
    id: "acc_001",
    name: "Anchor Career JP",
    instagramHandle: "@anchor_career_jp",
    canvaTemplateId: "tpl_wakaru_explainer_v1",
    tone: "やさしく実践的。保存したくなる手順解説"
  };

  const guideline: Guideline = {
    id: "guide_001",
    accountId: account.id,
    target: "転職を考え始めた20〜30代会社員",
    concept: "在職中にできる準備を、1投稿1テーマで分かりやすく伝える",
    tone: account.tone,
    contentPillars: ["転職準備", "面接", "職務経歴書", "退職手続き", "年収交渉"],
    ngRules: [
      "内定を保証しない",
      "前職・特定企業の誹謗中傷をしない",
      "参考アカウントの文言・ビジュアルをそのまま複製しない",
      "給与は求人データがある場合のみ原文のまま書く"
    ],
    ctaPolicy: "最終スライドは保存・フォロー・DM相談のいずれかを促す。押し売り口調は避ける。",
    hashtagPolicy: "ハッシュタグは3〜8個。求人紹介時は #PR または #求人 を含める。",
    jobPickEnabled: false,
    systemPrompt:
      "あなたは転職ノウハウ系Instagramの企画編集者です。ガイドライン・参考パターン・メモリーを守り、重複しない企画を提案してください。",
    version: 1,
    active: true,
    createdAt: t,
    updatedAt: t
  };

  const references: Reference[] = [
    {
      id: "ref_slide_001",
      accountId: account.id,
      kind: "slide_pattern",
      title: "解説カルーセル 8枚ハイブリッド",
      sourceNote: "inspired-by @wakaru_tensyoku genre; structure only, no brand assets",
      structureJson: {
        format: "1080x1350",
        pages: 8,
        roles: [
          "cover_hook",
          "empathy",
          "point_1",
          "point_2",
          "point_3",
          "point_4",
          "job_pick_or_summary",
          "cta"
        ]
      },
      examplesText:
        "1枚目で悩みを一言フック → 2枚目で共感 → 3〜6で手順 → 7でまとめor求人 → 8でCTA。1スライド1メッセージ。",
      active: true,
      createdAt: t,
      updatedAt: t
    },
    {
      id: "ref_hook_001",
      accountId: account.id,
      kind: "hook_pattern",
      title: "損してる系フック",
      sourceNote: "generic career IG pattern",
      structureJson: { formula: "〇〇な人は損してる / 知らないと損" },
      examplesText: "転職前にこれを知らない人、損してます",
      active: true,
      createdAt: t,
      updatedAt: t
    },
    {
      id: "ref_hook_002",
      accountId: account.id,
      kind: "hook_pattern",
      title: "手順系フック",
      sourceNote: "generic career IG pattern",
      structureJson: { formula: "在職中にやる順番 / Nステップ" },
      examplesText: "辞めたいと思ったら、在職中にやる順番",
      active: true,
      createdAt: t,
      updatedAt: t
    },
    {
      id: "ref_hook_003",
      accountId: account.id,
      kind: "hook_pattern",
      title: "チェックリスト系フック",
      sourceNote: "generic career IG pattern",
      structureJson: { formula: "見るべきポイント一覧" },
      examplesText: "求人票で見落とされがちな3つのポイント",
      active: true,
      createdAt: t,
      updatedAt: t
    },
    {
      id: "ref_voice_001",
      accountId: account.id,
      kind: "voice_sample",
      title: "トーン見本",
      sourceNote: "original",
      structureJson: null,
      examplesText:
        "断定しすぎず、「まずはこれだけ」と絞る。専門用語はかみ砕く。読者に寄り添う二人称（あなた）を使う。",
      active: true,
      createdAt: t,
      updatedAt: t
    }
  ];

  const memory: MemoryItem[] = [];

  const ideas: Idea[] = [
    {
      id: "idea_001",
      accountId: account.id,
      title: "転職で後悔しない人がやっている3つの準備",
      summary: "勢いで辞める前に、理由の言語化・理想の働き方・社風チェックを在職中に進める企画。",
      pillar: "転職準備",
      topicKey: "prep.before_quit.three_steps",
      hook: "辞めたい気持ちだけで動くと、選択肢が狭まります",
      angle: "在職中にできる準備に絞る",
      referenceIds: ["ref_slide_001", "ref_hook_002"],
      jobId: null,
      status: "queued",
      agentRunId: null,
      score: 0.9,
      rationale: "ガイドラインの柱「転職準備」に合致。メモリーに未使用。",
      createdAt: t,
      updatedAt: t
    }
  ];

  const jobs: Job[] = [
    {
      id: "job_001",
      company: "Anchor Data",
      role: "Data Analyst",
      location: "Tokyo",
      url: "https://example.com/jobs/1"
    }
  ];

  const posts: Post[] = [];
  const assets: PostAsset[] = [];

  return { account, guideline, references, memory, ideas, jobs, posts, assets };
}
