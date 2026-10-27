"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { GuidelineUpsert } from "@ama/shared";
import { useWorkspace } from "./workspace-context";
import { formatMonthDay } from "../lib/schedule";

interface FormState {
  readonly persona: string;
  readonly concept: string;
  readonly target: string;
  readonly tone: string;
  readonly pillars: string;
  readonly ngRules: string;
  readonly ctaPolicy: string;
  readonly hashtagPolicy: string;
}

const EMPTY_FORM: FormState = {
  persona: "",
  concept: "",
  target: "",
  tone: "",
  pillars: "",
  ngRules: "",
  ctaPolicy: "",
  hashtagPolicy: ""
};

interface SectionDef {
  readonly key: keyof FormState;
  readonly label: string;
  readonly hint?: string;
  readonly rows: number;
  readonly warn?: boolean;
}

const PERSONA_SECTION: SectionDef = {
  key: "persona",
  label: "ペルソナ(エージェントの役割・システムプロンプト)",
  hint: "エージェントがどんな立場で企画・文章を作るかを指定します",
  rows: 4
};

const GUIDELINE_SECTIONS: readonly SectionDef[] = [
  { key: "concept", label: "サービスコンセプト", rows: 3 },
  { key: "target", label: "ターゲット", rows: 2 },
  { key: "tone", label: "トーン&マナー", rows: 2 },
  { key: "pillars", label: "コンテンツの柱(1行に1つ)", rows: 3 },
  { key: "ngRules", label: "禁止事項(1行に1つ)", rows: 4, warn: true },
  { key: "ctaPolicy", label: "CTAの方針", rows: 2 },
  { key: "hashtagPolicy", label: "ハッシュタグ", rows: 2 }
];

const toLines = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.replace(/^[・\-•]\s*/, "").trim())
    .filter((line) => line.length > 0);

const fromLines = (items: readonly string[]): string => items.map((item) => `・${item}`).join("\n");

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "保存に失敗しました";
}

/** Persona + guideline editor for the active account. Saves a new guideline version. */
export function AgentProfileForm() {
  const { guideline, activeAccountId, apiReady, saveGuidelineDetails, notify } = useWorkspace();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!guideline) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      persona: guideline.systemPrompt,
      concept: guideline.concept,
      target: guideline.target,
      tone: guideline.tone,
      pillars: fromLines(guideline.contentPillars),
      ngRules: fromLines(guideline.ngRules),
      ctaPolicy: guideline.ctaPolicy,
      hashtagPolicy: guideline.hashtagPolicy
    });
  }, [guideline]);

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: e.target.value }));

  const save = async () => {
    if (!form.concept.trim() || !form.target.trim() || !form.tone.trim()) {
      notify("コンセプト・ターゲット・トーンは必須です");
      return;
    }
    const body: GuidelineUpsert = {
      concept: form.concept.trim(),
      target: form.target.trim(),
      tone: form.tone.trim(),
      contentPillars: toLines(form.pillars),
      ngRules: toLines(form.ngRules),
      ctaPolicy: form.ctaPolicy.trim(),
      hashtagPolicy: form.hashtagPolicy.trim(),
      jobPickEnabled: guideline?.jobPickEnabled ?? false,
      systemPrompt: form.persona
    };
    setSaving(true);
    try {
      await saveGuidelineDetails(activeAccountId, body);
      notify("エージェント設定を保存しました");
    } catch (error) {
      notify(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (section: SectionDef) => (
    <div className="guide-section" key={section.key}>
      <span className={`eyebrow plain${section.warn ? " warn" : ""}`}>{section.label}</span>
      {section.hint ? <p className="muted small pad-b-8">{section.hint}</p> : null}
      <textarea
        className="textarea"
        rows={section.rows}
        aria-label={section.label}
        value={form[section.key]}
        disabled={!apiReady || saving}
        onChange={set(section.key)}
      />
    </div>
  );

  if (apiReady && !guideline) {
    return <p className="empty">このアカウントのガイドラインはまだありません</p>;
  }

  return (
    <div className="agent-profile">
      <div className="row between">
        <span className="muted small">
          {guideline ? `最終更新 ${formatMonthDay(guideline.updatedAt)} ・ バージョン ${guideline.version}` : "API未接続のため編集できません"}
        </span>
        <button className="btn primary" disabled={!apiReady || saving} onClick={() => void save()}>
          {saving ? "保存中…" : "エージェント設定を保存"}
        </button>
      </div>
      <div className="guide-sections">
        {renderSection(PERSONA_SECTION)}
        {GUIDELINE_SECTIONS.map(renderSection)}
      </div>
    </div>
  );
}
