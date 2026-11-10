"use client";

import { useCallback, useEffect, useState } from "react";
import type { SlideRole } from "@ama/shared";
import { useWorkspace } from "../workspace-context";
import {
  analyzeAccountDesign,
  analyzeAccountStructure,
  deleteDesignReference,
  designReferenceUrl,
  listDesignReferences,
  getAccountDesign,
  saveAccountDesignNotes,
  saveAccountStructure,
  type AccountDesignView
} from "../../lib/api";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export type DesignBusy = "analyze" | "save" | "structure" | "structure-save" | null;

/**
 * An account's design (look, written guideline, page structure) with the actions that change it.
 * Shared by the デザイン page and the onboarding steps, so both always show the same saved state.
 */
export function useAccountDesign(accountId: string) {
  const { apiReady, notify, setAccountStructure } = useWorkspace();
  const [design, setDesign] = useState<AccountDesignView | null>(null);
  const [guideline, setGuideline] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [structure, setStructure] = useState<SlideRole[]>([]);
  const [busy, setBusy] = useState<DesignBusy>(null);
  const [referenceUrls, setReferenceUrls] = useState<ReadonlyArray<{ name: string; url: string }>>([]);

  const loadReferences = useCallback(async () => {
    if (!apiReady || !accountId) return;
    try {
      const { items } = await listDesignReferences(accountId);
      setReferenceUrls(items.map(({ name }) => ({ name, url: designReferenceUrl(accountId, name) })));
    } catch {
      setReferenceUrls([]);
    }
  }, [accountId, apiReady]);

  useEffect(() => {
    setReferenceUrls([]);
    void loadReferences();
  }, [loadReferences]);

  const adopt = useCallback((next: AccountDesignView) => {
    setDesign(next);
    setGuideline(next.guideline);
    setReferenceNote(next.referenceNote);
    setStructure([...next.structure]);
  }, []);

  useEffect(() => {
    if (!apiReady || !accountId) return;
    let cancelled = false;
    setDesign(null);
    getAccountDesign(accountId)
      .then(({ design: loaded }) => {
        if (!cancelled) adopt(loaded);
      })
      .catch((error: unknown) => notify(errorText(error, "デザインを取得できませんでした")));
    return () => {
      cancelled = true;
    };
  }, [accountId, apiReady, adopt, notify]);

  const run = useCallback(
    async (kind: Exclude<DesignBusy, null>, task: () => Promise<{ design: AccountDesignView }>, done: string, failed: string) => {
      setBusy(kind);
      try {
        const { design: next } = await task();
        adopt(next);
        setAccountStructure(accountId, next.structure);
        notify(done);
        return true;
      } catch (error) {
        notify(errorText(error, failed));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [accountId, adopt, notify, setAccountStructure]
  );

  return {
    design,
    guideline,
    setGuideline,
    referenceNote,
    setReferenceNote,
    structure,
    setStructure,
    busy,
    /** Derive the look from the screenshots + guideline. */
    analyze: async (screenshots: readonly string[]) => {
      const ok = await run("analyze", () => analyzeAccountDesign(accountId, { screenshots: [...screenshots], guideline, referenceNote }), "デザインを作成しました。以降の投稿に反映されます", "デザインを作成できませんでした");
      if (ok) await loadReferences();
      return ok;
    },
    /** Screenshots the current design was derived from. */
    referenceUrls,
    removeReference: async (name: string) => {
      try {
        await deleteDesignReference(accountId, name);
        setReferenceUrls((current) => current.filter((item) => item.name !== name));
      } catch (error) {
        notify(errorText(error, "画像を削除できませんでした"));
      }
    },
    /** Save the guideline and reference note only. */
    saveNotes: () => run("save", () => saveAccountDesignNotes(accountId, { guideline, referenceNote }), "ガイドラインを保存しました", "保存に失敗しました"),
    /** Infer the page structure from the screenshots. */
    analyzeStructure: (screenshots: readonly string[]) =>
      run("structure", () => analyzeAccountStructure(accountId, [...screenshots]), "スライド構成を推定しました。必要なら調整してください", "構成を推定できませんでした"),
    /** Save the structure as edited. */
    saveStructure: () => run("structure-save", () => saveAccountStructure(accountId, structure), "スライド構成を保存しました", "構成を保存できませんでした")
  };
}
