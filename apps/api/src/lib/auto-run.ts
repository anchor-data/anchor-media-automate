import type { Repository } from "@ama/db";
import { isAutoRunDue, type Account } from "@ama/shared";
import { generatePost } from "../routes/creation";
import { runIdeation } from "../routes/ideation";
import { createRepo, type Bindings } from "./env";

const IDEAS_PER_RUN = 1;

export interface AutoRunResult {
  readonly accountId: string;
  readonly ok: boolean;
  readonly postId?: string;
  readonly error?: string;
}

/** Generate fresh ideas for the account, then turn the best new one into a draft post. */
async function runAccount(env: Bindings, repo: Repository, account: Account): Promise<AutoRunResult> {
  try {
    const { items } = await runIdeation(repo, env.OPENAI_API_KEY, {
      accountId: account.id,
      count: IDEAS_PER_RUN
    });
    const [best] = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (!best) throw new Error("Ideation returned no ideas");

    await repo.updateIdea(best.id, { status: "selected" });
    const { post } = await repo.createPostDraft({
      accountId: account.id,
      title: best.title,
      caption: "",
      assets: [],
      ideaId: best.id,
      generationStatus: "pending"
    });
    // generatePost never throws: failures are recorded on the post.
    await generatePost(env, post.id, { ideaId: best.id, accountId: account.id }, "creation");
    return { accountId: account.id, ok: true, postId: post.id };
  } catch (error) {
    return { accountId: account.id, ok: false, error: error instanceof Error ? error.message : "Auto run failed" };
  }
}

/** Cron entry point (hourly): run every enabled account whose schedule matches the current JST hour. */
export async function runDueAutoRuns(env: Bindings, now: Date = new Date()): Promise<AutoRunResult[]> {
  const repo = createRepo(env);
  const accounts = await repo.listAccounts();
  const due = accounts.filter(
    (a) => a.autoRunEnabled && isAutoRunDue(a.autoRunSchedule ?? "", now, a.lastAutoRunAt)
  );

  const results: AutoRunResult[] = [];
  for (const account of due) {
    // Mark first so an overlapping or retried trigger can't double-post within the same hour.
    await repo.markAutoRun(account.id, now.toISOString());
    results.push(await runAccount(env, repo, account));
  }
  return results;
}
