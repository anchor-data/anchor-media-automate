"use client";

import { useCallback, useState } from "react";
import { useWorkspace } from "./workspace-context";

/**
 * Seeds the real ideation endpoint with an insight and drops the results into the idea queue.
 * Used by the analytics screens, whose insights themselves are mocked.
 */
export function useQueueIdeas(count = 2) {
  const { generateIdeasFromApi, notify, apiReady } = useWorkspace();
  const [busy, setBusy] = useState(false);

  const queue = useCallback(
    async (seedText: string) => {
      if (!apiReady) {
        notify("API未接続のため企画を追加できません");
        return;
      }
      setBusy(true);
      try {
        const made = await generateIdeasFromApi({ seedText, count });
        notify(`${made.length}件の企画をアイデアキューに追加しました`);
      } catch (error) {
        notify(error instanceof Error ? error.message : "企画の追加に失敗しました");
      } finally {
        setBusy(false);
      }
    },
    [apiReady, count, generateIdeasFromApi, notify]
  );

  return { queue, busy };
}
