import { AUTO_RUN_SCHEDULES, type GenerationStatus, type PostStatus as ApiPostStatus, type SlideFields } from "@ama/shared";

export type PostStatus = "draft" | "scheduled" | "published";

export interface MockPost {
  readonly id: string;
  readonly accountId: string;
  readonly title: string;
  readonly caption: string;
  readonly status: PostStatus;
  /** Status as stored by the API (draft/approved/scheduled/published/rejected/failed); undefined offline. */
  readonly rawStatus?: ApiPostStatus;
  readonly day: number;
  /** Scheduled time if set, else creation time. Drives calendar placement. */
  readonly dateIso: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
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
  /** Slide copy the agent produced; undefined for offline drafts. */
  readonly slides?: SlideFields;
}

export interface MockAccount {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly target: string;
  readonly concept: string;
  readonly schedule: string;
  /** Periodic idea + content generation at `schedule` (API accounts only). */
  readonly autoRunEnabled?: boolean;
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
  published: "公開済み"
};

export const SCHEDULE_OPTIONS = AUTO_RUN_SCHEDULES;
export const DEFAULT_PROMPT =
  "あなたはプロのSNSマーケターです。提供される自社データやテーマに基づき、Demindのテンプレートに従って魅力的なInstagramのカルーセル投稿を企画してください。";

/** Offline fallback accounts, used only when the API is unreachable. */
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
  }
];
