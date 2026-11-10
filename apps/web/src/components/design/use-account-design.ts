"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SlideRole } from "@ama/shared";
import { useWorkspace } from "../workspace-context";
import { MAX_SCREENSHOTS, toScreenshotWithPalette } from "../../lib/screenshots";
import {
  addDesignReference,
  analyzeAccountDesign,
  analyzeAccountStructure,
  deleteDesignReference,
  designBackgroundUrl,
  designReferenceUrl,
  generateDesignBackground,
  listDesignBackgrounds,
  listDesignReferences,
  setDesignReferencePage,
  type DesignBackground,
  getAccountDesign,
  saveAccountDesignNotes,
  saveAccountStructure,
  type AccountDesignView
} from "../../lib/api";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export type DesignBusy = "analyze" | "references" | "backgrounds" | "save" | "structure" | "structure-save" | null;

/** A saved reference screenshot and the page of the carousel it shows (null = not said). */
export type SavedReference = { name: string; page: number | null; url: string };

export type BackgroundUrls = Partial<Record<SlideRole, readonly string[]>>;

/** Roles of a structure, once each and in order of first appearance. */
function uniqueRoles(structure: readonly SlideRole[]): SlideRole[] {
  return structure.filter((role, index) => structure.indexOf(role) === index);
}

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
  const [referenceUrls, setReferenceUrls] = useState<ReadonlyArray<SavedReference>>([]);

  const loadReferences = useCallback(async () => {
    if (!apiReady || !accountId) return;
    try {
      const { items } = await listDesignReferences(accountId);
      setReferenceUrls(items.map(({ name, page }) => ({ name, page, url: designReferenceUrl(accountId, name) })));
    } catch {
      setReferenceUrls([]);
    }
  }, [accountId, apiReady]);

  useEffect(() => {
    setReferenceUrls([]);
    void loadReferences();
  }, [loadReferences]);

  const [backgroundEntries, setBackgroundEntries] = useState<readonly DesignBackground[]>([]);
  const [backgroundsEnabled, setBackgroundsEnabled] = useState(false);
  const [backgroundProgress, setBackgroundProgress] = useState<{ done: number; total: number } | null>(null);

  const loadBackgrounds = useCallback(async () => {
    if (!apiReady || !accountId) return;
    try {
      const { items, enabled } = await listDesignBackgrounds(accountId);
      setBackgroundEntries(items);
      setBackgroundsEnabled(enabled);
    } catch {
      setBackgroundEntries([]);
    }
  }, [accountId, apiReady]);

  useEffect(() => {
    setBackgroundEntries([]);
    void loadBackgrounds();
  }, [loadBackgrounds]);

  // Absolute urls: the sample pages are drawn inside sandboxed srcdoc frames.
  const backgrounds = useMemo<BackgroundUrls>(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const byRole: Record<string, string[]> = {};
    for (const { role, name } of backgroundEntries) {
      byRole[role] = [...(byRole[role] ?? []), `${origin}${designBackgroundUrl(accountId, name)}`];
    }
    return byRole;
  }, [accountId, backgroundEntries]);

  /** Generate the artwork of these roles one after another (the image API is rate limited). */
  const generateBackgrounds = useCallback(
    async (roles: readonly SlideRole[]): Promise<boolean> => {
      setBusy("backgrounds");
      let ok = true;
      try {
        for (const [index, role] of roles.entries()) {
          setBackgroundProgress({ done: index, total: roles.length });
          const { items } = await generateDesignBackground(accountId, role);
          setBackgroundEntries(items);
        }
        notify("背景アートを作成しました。見本と以降の投稿に反映されます");
      } catch (error) {
        ok = false;
        notify(errorText(error, "背景アートを作成できませんでした"));
      } finally {
        setBackgroundProgress(null);
        setBusy(null);
      }
      return ok;
    },
    [accountId, notify]
  );

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
    async (kind: Exclude<DesignBusy, null>, task: () => Promise<{ design: AccountDesignView }>, done: string, failed: string): Promise<AccountDesignView | null> => {
      setBusy(kind);
      try {
        const { design: next } = await task();
        adopt(next);
        setAccountStructure(accountId, next.structure);
        notify(done);
        return next;
      } catch (error) {
        notify(errorText(error, failed));
        return null;
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
    analyze: async (screenshots: readonly string[], screenshotPages: readonly number[] = []) => {
      const next = await run("analyze", () => analyzeAccountDesign(accountId, { screenshots: [...screenshots], screenshotPages: [...screenshotPages], guideline, referenceNote }), "デザインを作成しました。以降の投稿に反映されます", "デザインを作成できませんでした");
      if (!next) return false;
      await loadReferences();
      if (backgroundsEnabled) await generateBackgrounds(uniqueRoles(next.structure));
      return true;
    },
    /** Background artwork per page role, as urls. */
    backgrounds,
    backgroundCount: backgroundEntries.length,
    backgroundProgress,
    /** Generate the artwork again from the saved references, keeping the current design. */
    regenerateBackgrounds: () => generateBackgrounds(uniqueRoles(structure)),
    backgroundsEnabled,
    /** Screenshots the current design was derived from. */
    referenceUrls,
    /** Attach screenshots to a page (resized first). Stops at the maximum number of references. */
    attachReferences: async (files: readonly File[], page: number) => {
      const room = MAX_SCREENSHOTS - referenceUrls.length;
      if (room <= 0) {
        notify(`参考画像は最大${MAX_SCREENSHOTS}枚までです`);
        return;
      }
      setBusy("references");
      try {
        const added: SavedReference[] = [];
        for (const file of files.slice(0, room)) {
          const { src, palette } = await toScreenshotWithPalette(file);
          const { item } = await addDesignReference(accountId, src, page, palette);
          added.push({ name: item.name, page: item.page, url: designReferenceUrl(accountId, item.name) });
        }
        setReferenceUrls((current) => [...current, ...added]);
        if (files.length > room) notify(`参考画像は最大${MAX_SCREENSHOTS}枚までのため、${room}枚だけ追加しました`);
      } catch (error) {
        notify(errorText(error, "画像を追加できませんでした"));
      } finally {
        setBusy(null);
      }
    },
    /**
     * Page numbers after pages were moved or removed. The screen changes at once; the files are then
     * renamed / deleted in order (a rename changes the file's name, so the names are taken from the answers).
     */
    syncReferences: async (moves: ReadonlyArray<{ name: string; page: number }>, removals: readonly string[]) => {
      if (moves.length === 0 && removals.length === 0) return;
      const pageOf = new Map(moves.map((move) => [move.name, move.page]));
      setReferenceUrls((current) =>
        current.filter((ref) => !removals.includes(ref.name)).map((ref) => (pageOf.has(ref.name) ? { ...ref, page: pageOf.get(ref.name)! } : ref))
      );
      setBusy("references");
      try {
        for (const name of removals) await deleteDesignReference(accountId, name);
        for (const move of moves) {
          const { item } = await setDesignReferencePage(accountId, move.name, move.page);
          setReferenceUrls((current) => current.map((ref) => (ref.name === move.name ? { name: item.name, page: item.page, url: designReferenceUrl(accountId, item.name) } : ref)));
        }
      } catch (error) {
        notify(errorText(error, "参考画像を更新できませんでした"));
        await loadReferences();
      } finally {
        setBusy(null);
      }
    },
    /** Say which page a saved reference shows (0 clears it). */
    setReferencePage: async (name: string, page: number) => {
      try {
        const { item } = await setDesignReferencePage(accountId, name, page);
        setReferenceUrls((current) => current.map((ref) => (ref.name === name ? { name: item.name, page: item.page, url: designReferenceUrl(accountId, item.name) } : ref)));
      } catch (error) {
        notify(errorText(error, "ページ番号を保存できませんでした"));
      }
    },
    removeReference: async (name: string) => {
      try {
        await deleteDesignReference(accountId, name);
        setReferenceUrls((current) => current.filter((item) => item.name !== name));
      } catch (error) {
        notify(errorText(error, "画像を削除できませんでした"));
      }
    },
    /** Save the guideline and reference note only. */
    saveNotes: async () => (await run("save", () => saveAccountDesignNotes(accountId, { guideline, referenceNote }), "ガイドラインを保存しました", "保存に失敗しました")) !== null,
    /** Infer the page structure from the screenshots. */
    analyzeStructure: async (screenshots: readonly string[]) =>
      (await run("structure", () => analyzeAccountStructure(accountId, [...screenshots]), "スライド構成を推定しました。必要なら調整してください", "構成を推定できませんでした")) !== null,
    /** Save the structure as edited. */
    saveStructure: async (next: readonly SlideRole[] = structure) =>
      (await run("structure-save", () => saveAccountStructure(accountId, [...next]), "スライド構成を保存しました", "構成を保存できませんでした")) !== null
  };
}
