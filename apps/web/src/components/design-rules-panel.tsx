"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DESIGN_RULES, TITLE_POSITIONS, type DesignRules } from "@ama/shared";
import { getDesignRules, saveDesignRules } from "../lib/api";
import { useWorkspace } from "./workspace-context";

const TITLE_POSITION_LABEL: Record<(typeof TITLE_POSITIONS)[number], string> = {
  top: "上",
  center: "中央",
  bottom: "下"
};

/** Account-wide slide design rules. Per-post tweaks are entered at generation time instead. */
export function DesignRulesPanel() {
  const { activeAccountId, apiReady, notify } = useWorkspace();
  const [rules, setRules] = useState<DesignRules>(DEFAULT_DESIGN_RULES);
  const [colors, setColors] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;
    getDesignRules(activeAccountId)
      .then(({ rules: loaded }) => {
        if (cancelled) return;
        setRules(loaded);
        setColors(loaded.colorPatterns.join("\n"));
      })
      .catch(() => notify("デザインルールの取得に失敗しました"));
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, apiReady, notify]);

  const set = (patch: Partial<DesignRules>) => setRules((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const next = { ...rules, colorPatterns: colors.split("\n").map((line) => line.trim()).filter(Boolean) };
      const { rules: saved } = await saveDesignRules(activeAccountId, next);
      setRules(saved);
      notify("デザインルールを保存しました");
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack gap-12" style={{ maxWidth: 560 }}>
      <p className="muted small" style={{ margin: 0 }}>
        すべての投稿に共通で適用されます。投稿ごとの調整は、生成前のカスタマイズで指定します。
      </p>
      <div className="stack gap-4">
        <label className="label" htmlFor="dr-font">フォント</label>
        <input id="dr-font" className="input" value={rules.fontFamily} placeholder="例: Noto Sans JP Bold" onChange={(e) => set({ fontFamily: e.target.value })} />
      </div>
      <div className="stack gap-4">
        <label className="label" htmlFor="dr-title">タイトル位置</label>
        <select id="dr-title" className="input" value={rules.titlePosition} onChange={(e) => set({ titlePosition: e.target.value as DesignRules["titlePosition"] })}>
          {TITLE_POSITIONS.map((position) => (
            <option key={position} value={position}>{TITLE_POSITION_LABEL[position]}</option>
          ))}
        </select>
      </div>
      <div className="stack gap-4">
        <label className="label" htmlFor="dr-emphasis">強調表現ルール</label>
        <textarea id="dr-emphasis" className="textarea" rows={2} value={rules.emphasisRule} placeholder="例: 重要語はブランドカラー、1枚につき1か所まで" onChange={(e) => set({ emphasisRule: e.target.value })} />
      </div>
      <div className="stack gap-4">
        <label className="label" htmlFor="dr-colors">色パターン候補 (1行に1つ)</label>
        <textarea id="dr-colors" className="textarea" rows={3} value={colors} placeholder={"例:\n紺 × 白\nオレンジ × 白"} onChange={(e) => setColors(e.target.value)} />
      </div>
      <label className="row gap-8" style={{ alignItems: "center" }}>
        <input type="checkbox" checked={rules.allowEmoji} onChange={(e) => set({ allowEmoji: e.target.checked })} />
        絵文字を使う
      </label>
      <label className="row gap-8" style={{ alignItems: "center" }}>
        <input type="checkbox" checked={rules.allowIcons} onChange={(e) => set({ allowIcons: e.target.checked })} />
        アイコンを使う
      </label>
      <div className="stack gap-4">
        <label className="label" htmlFor="dr-readability">可読性ルール</label>
        <textarea id="dr-readability" className="textarea" rows={2} value={rules.readabilityRules} placeholder="例: 1文は短く、専門用語は避ける" onChange={(e) => set({ readabilityRules: e.target.value })} />
      </div>
      <div>
        <button className="btn primary" disabled={!apiReady || saving} onClick={() => void save()}>
          {saving ? "保存中…" : "デザインルールを保存"}
        </button>
      </div>
    </div>
  );
}
