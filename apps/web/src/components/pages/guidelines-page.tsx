"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { GuidelineUpsert, MemoryItem, Reference } from "@ama/shared";
import { Icon } from "../icon";
import { PageTopbar, Tabs } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { readAsDataUrl } from "../../lib/read-file";
import { formatMonthDay } from "../../lib/schedule";

type GuidelineTab = "guideline" | "references" | "memory";

const MAX_SCREENSHOTS = 10;

const MEMORY_LABEL: Record<MemoryItem["kind"], string> = {
  topic_used: "topic_used",
  hook_used: "hook_used",
  idea_rejected: "idea_rejected",
  editor_feedback: "editor_feedback",
  preference: "preference"
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const toLines = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.replace(/^[・\-•]\s*/, "").trim())
    .filter((line) => line.length > 0);

const fromLines = (items: readonly string[]): string => items.map((item) => `・${item}`).join("\n");

interface FormState {
  readonly concept: string;
  readonly target: string;
  readonly tone: string;
  readonly pillars: string;
  readonly ngRules: string;
  readonly ctaPolicy: string;
  readonly hashtagPolicy: string;
  readonly systemPrompt: string;
}

const EMPTY_FORM: FormState = {
  concept: "",
  target: "",
  tone: "",
  pillars: "",
  ngRules: "",
  ctaPolicy: "",
  hashtagPolicy: "",
  systemPrompt: ""
};

function ReferenceRows({ items, compact, onRemove }: { items: readonly Reference[]; compact: boolean; onRemove: (r: Reference) => void }) {
  if (items.length === 0) return <p className="empty small">参照資料はまだありません</p>;
  return (
    <ul className="plain-list">
      {items.map((ref) => (
        <li className="ref-row" key={ref.id}>
          <div className="stack gap-2 grow">
            <strong>{ref.title}</strong>
            <span className="muted small">
              {ref.kind} · 更新 {formatMonthDay(ref.updatedAt)}
            </span>
            {compact ? null : <span className="small ref-body">{ref.examplesText.slice(0, 300)}</span>}
          </div>
          <button className="icon-btn" aria-label="参照を削除" onClick={() => onRemove(ref)}>
            <Icon name="x" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function MemoryRows({ items, compact, onRemove }: { items: readonly MemoryItem[]; compact: boolean; onRemove: (m: MemoryItem) => void }) {
  if (items.length === 0) return <p className="empty small">まだ記録がありません</p>;
  const shown = compact ? items.slice(0, 6) : items;
  return (
    <ul className="plain-list">
      {shown.map((item) => (
        <li className="mem-row" key={item.id}>
          <span className={`mem-kind${item.kind === "idea_rejected" ? " warn" : ""}`}>{MEMORY_LABEL[item.kind]}</span>
          <span className="grow small">{item.topicKey}</span>
          <span className="muted small">{formatMonthDay(item.createdAt)}</span>
          <button className="icon-btn" aria-label="メモリを削除" onClick={() => onRemove(item)}>
            <Icon name="x" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function GuidelinesPage() {
  const {
    guideline,
    references,
    memoryItems,
    activeAccountId,
    apiReady,
    saveGuidelineDetails,
    addReference,
    uploadReference,
    importInstagramReference,
    removeReference,
    removeMemory,
    notify
  } = useWorkspace();
  const [tab, setTab] = useState<GuidelineTab>("guideline");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refTitle, setRefTitle] = useState("");
  const [refBody, setRefBody] = useState("");
  const [igUrl, setIgUrl] = useState("");
  const [screenshots, setScreenshots] = useState<readonly string[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!guideline) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      concept: guideline.concept,
      target: guideline.target,
      tone: guideline.tone,
      pillars: fromLines(guideline.contentPillars),
      ngRules: fromLines(guideline.ngRules),
      ctaPolicy: guideline.ctaPolicy,
      hashtagPolicy: guideline.hashtagPolicy,
      systemPrompt: guideline.systemPrompt
    });
  }, [guideline]);

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
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
      systemPrompt: form.systemPrompt
    };
    setSaving(true);
    try {
      await saveGuidelineDetails(activeAccountId, body);
      notify("ガイドラインを保存しました");
    } catch (error) {
      notify(errorText(error, "保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const onScreenshots = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_SCREENSHOTS);
    event.target.value = "";
    try {
      setScreenshots(await Promise.all(files.map(readAsDataUrl)));
    } catch (error) {
      notify(errorText(error, "画像を読み込めませんでした"));
    }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const count = await importInstagramReference(activeAccountId, igUrl.trim(), [...screenshots]);
      notify(`Instagramから ${count} 件の参照を追加しました`);
      setIgUrl("");
      setScreenshots([]);
    } catch (error) {
      notify(errorText(error, "インポートに失敗しました"));
    } finally {
      setImporting(false);
    }
  };

  const submitReference = () =>
    addReference(activeAccountId, refTitle.trim(), refBody.trim())
      .then(() => {
        setRefTitle("");
        setRefBody("");
        setAdding(false);
        notify("参照を追加しました");
      })
      .catch((error: unknown) => notify(errorText(error, "参照の追加に失敗")));

  const dropReference = (ref: Reference) =>
    void removeReference(ref.id)
      .then(() => notify("参照を削除しました"))
      .catch((error: unknown) => notify(errorText(error, "削除に失敗しました")));
  const dropMemory = (item: MemoryItem) =>
    void removeMemory(item.id)
      .then(() => notify("メモリーを削除しました"))
      .catch((error: unknown) => notify(errorText(error, "削除に失敗しました")));

  const sections: readonly { label: string; key: keyof FormState; rows: number; single?: boolean; accent?: boolean }[] = [
    { label: "サービスコンセプト", key: "concept", rows: 3 },
    { label: "ターゲット", key: "target", rows: 2 },
    { label: "トーン&マナー", key: "tone", rows: 2 },
    { label: "コンテンツの柱", key: "pillars", rows: 3 },
    { label: "禁止事項", key: "ngRules", rows: 4, accent: true },
    { label: "CTAの方針", key: "ctaPolicy", rows: 2 },
    { label: "ハッシュタグ", key: "hashtagPolicy", rows: 2 },
    { label: "システムプロンプト(エージェント)", key: "systemPrompt", rows: 4 }
  ];

  return (
    <>
      <PageTopbar title="ガイドライン・参照">
        {guideline ? (
          <span className="muted small">
            最終更新 {formatMonthDay(guideline.updatedAt)} ・ バージョン {guideline.version}
          </span>
        ) : null}
        <button className="btn primary" disabled={!apiReady || saving || tab !== "guideline"} onClick={() => void save()}>
          {saving ? "保存中…" : "変更を保存"}
        </button>
      </PageTopbar>
      <div className="split">
        <section className="pane grow pad-32">
          <Tabs
            label="ガイドライン"
            value={tab}
            onChange={setTab}
            options={[
              { id: "guideline", label: "ガイドライン" },
              { id: "references", label: `参照資料 ${references.length}` },
              { id: "memory", label: `メモリ ${memoryItems.length}` }
            ]}
          />
          {tab === "guideline" ? (
            guideline || !apiReady ? (
              <div className="guide-sections">
                {sections.map((section) => (
                  <div className="guide-section" key={section.key}>
                    <span className={`eyebrow plain${section.accent ? " warn" : ""}`}>{section.label}</span>
                    <textarea
                      className="textarea plain-area"
                      rows={section.rows}
                      aria-label={section.label}
                      value={form[section.key]}
                      disabled={!apiReady}
                      onChange={set(section.key)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">このアカウントのガイドラインはまだありません</p>
            )
          ) : null}
          {tab === "references" ? (
            <div className="pad-t-16">
              <ReferenceRows items={references} compact={false} onRemove={dropReference} />
            </div>
          ) : null}
          {tab === "memory" ? (
            <div className="pad-t-16">
              <MemoryRows items={memoryItems} compact={false} onRemove={dropMemory} />
            </div>
          ) : null}
        </section>

        <aside className="pane side-pane wide">
          <div className="row between">
            <h3 className="pane-title">参照資料</h3>
            <button className="link small" disabled={!apiReady} onClick={() => setAdding((v) => !v)}>
              {adding ? "閉じる" : "+ 追加"}
            </button>
          </div>
          {adding ? (
            <div className="note-box stack gap-8">
              <input className="input" placeholder="参照タイトル" value={refTitle} onChange={(e) => setRefTitle(e.target.value)} />
              <textarea className="textarea" rows={3} placeholder="参考テキスト・構造メモ" value={refBody} onChange={(e) => setRefBody(e.target.value)} />
              <button className="btn primary sm" disabled={!refTitle.trim()} onClick={() => void submitReference()}>
                参照を追加
              </button>
            </div>
          ) : null}
          <ReferenceRows items={references.slice(0, 4)} compact onRemove={dropReference} />
          <div className="row between pad-t-16">
            <h3 className="pane-title">メモリ(エージェントの記憶)</h3>
            <span className="muted small">{memoryItems.length}件</span>
          </div>
          <MemoryRows items={memoryItems} compact onRemove={dropMemory} />
          <p className="muted small">承認・却下の結果は自動でメモリに書き込まれ、次回のアイデア提案から重複を避けます。</p>
          <div className="note-box stack gap-8">
            <strong>Instagramの参照アカウントから追加</strong>
            <input
              className="input"
              placeholder="@handle または instagram.com/handle"
              value={igUrl}
              onChange={(e) => setIgUrl(e.target.value)}
            />
            <label className="btn outline sm">
              <Icon name="upload" size={12} />
              スクリーンショット(最大{MAX_SCREENSHOTS}枚){screenshots.length > 0 ? ` — ${screenshots.length}枚` : ""}
              <input type="file" accept="image/*" multiple hidden onChange={(e) => void onScreenshots(e)} />
            </label>
            <div className="row gap-8">
              <button
                className="btn primary sm grow"
                disabled={!apiReady || importing || !igUrl.trim() || screenshots.length === 0}
                onClick={() => void runImport()}
              >
                {importing ? "抽出中…" : "抽出して参照に追加"}
              </button>
              <label className="btn outline sm">
                ファイル追加 (.txt/.md)
                <input
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  hidden
                  disabled={!apiReady}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    void uploadReference(activeAccountId, file)
                      .then(({ truncated }) => notify(truncated ? "参照を追加しました(長いため一部のみ)" : "参照を追加しました"))
                      .catch((error: unknown) => notify(errorText(error, "アップロードに失敗")));
                  }}
                />
              </label>
            </div>
            <p className="muted small">原文はコピーせず、フック・構成・トーンを言い換えて抽出します。</p>
          </div>
        </aside>
      </div>
    </>
  );
}
