import type { MockPost } from "./mock-data";

/** Where a post sits in the production pipeline. */
export type PostStage = "generating" | "failed" | "review" | "approved" | "scheduled" | "published" | "rejected";

const GENERATING = ["pending", "generating_copy", "rendering"] as const;

export function stageOf(post: MockPost): PostStage {
  if (post.rawStatus === "rejected") return "rejected";
  if (post.rawStatus === "published" || post.status === "published") return "published";
  if (post.rawStatus === "scheduled" || post.status === "scheduled") return "scheduled";
  if (post.rawStatus === "approved") return "approved";
  if (post.generationStatus === "failed" || post.rawStatus === "failed") return "failed";
  if (post.generationStatus && (GENERATING as readonly string[]).includes(post.generationStatus)) return "generating";
  return "review";
}

export const STAGE_LABEL: Record<PostStage, string> = {
  generating: "生成中",
  failed: "生成失敗",
  review: "レビュー中",
  approved: "承認済み",
  scheduled: "予約済み",
  published: "公開済み",
  rejected: "却下"
};

/** Rough generation progress for the pipeline progress bar. */
export function generationProgress(post: MockPost): number {
  switch (post.generationStatus) {
    case "pending":
      return 0.1;
    case "generating_copy":
      return 0.4;
    case "rendering":
      return 0.75;
    default:
      return 1;
  }
}

/** Posts that can still be reviewed (excludes rejected). */
export function isActive(post: MockPost): boolean {
  return stageOf(post) !== "rejected";
}
