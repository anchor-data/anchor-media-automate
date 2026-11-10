"use client";

import { useCallback, useRef } from "react";
import { useWorkspace } from "./workspace-context";

/**
 * Canva preview urls are signed and expire, so a stored url can be dead while the design is fine.
 * Returns an `<img onError>` handler that re-exports the previews once per post, so an expired
 * preview heals itself instead of needing the "プレビューを更新" button.
 */
export function useExpiredPreviewRefresh(postId: string): () => void {
  const { reloadPostAssets } = useWorkspace();
  const attempted = useRef<ReadonlySet<string>>(new Set());

  return useCallback(() => {
    if (!postId || attempted.current.has(postId)) return;
    attempted.current = new Set([...attempted.current, postId]);
    void reloadPostAssets(postId);
  }, [postId, reloadPostAssets]);
}
