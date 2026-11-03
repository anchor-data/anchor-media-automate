"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { renderSlideHtml, SLIDE_HEIGHT, SLIDE_WIDTH } from "@ama/renderer/src/html";
import type { DesignSpec } from "@ama/renderer/src/spec";
import { Icon } from "../icon";
import { PageTopbar } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { analyzeAccountDesign, getAccountDesign, saveAccountDesignNotes, type AccountDesignView } from "../../lib/api";
import { readAsDataUrl } from "../../lib/read-file";

const MAX_SCREENSHOTS = 8;
/** Longest side sent to the AI: plenty to read colors and layout, and keeps the request small. */
const SCREENSHOT_MAX_SIDE = 1280;

/** Sample copy so the design can be previewed without a post. */
const SAMPLE_FIELDS: Readonly<Record<string, string>> = {
  s1_title: "転職で後悔しない3つの準備",
  s1_sub: "3分でわかる",
  s2_head: "不安だよね",
  s2_body: "何から始めればいいか分からないのが普通です。",
  s3_num: "1",
  s3_head: "自己分析",
  s3_body: "得意なことや苦手なことを整理して、次の仕事で大切にしたいことを見つけよう。",
  s7_label: "まとめ",
  s7_head: "迷ったら",
  s7_body: "まずは転職の軸を決めて、気になる求人を比べてみよう。",
  s8_head: "保存して見返そう",
  s8_cta: "フォローしてね"
};
const PREVIEW_PAGES = [1, 3, 8] as const;
const PREVIEW_WIDTH = 220;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Shrink a screenshot to at most SCREENSHOT_MAX_SIDE px and re-encode as JPEG. */
async function toScreenshot(file: File): Promise<string> {
  const source = await readAsDataUrl(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = source;
  });
  const scale = Math.min(1, SCREENSHOT_MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function SlidePreview({ spec, index, handle }: { spec: DesignSpec; index: number; handle: string }) {
  const scale = PREVIEW_WIDTH / SLIDE_WIDTH;
  return (
    <div style={{ width: PREVIEW_WIDTH, height: SLIDE_HEIGHT * scale, overflow: "hidden", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,.2)" }}>
      <iframe
        title={`preview ${index}`}
        sandbox=""
        srcDoc={renderSlideHtml({ spec, index, fields: SAMPLE_FIELDS, handle })}
        style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
      />
    </div>
  );
}

function Swatches({ spec }: { spec: DesignSpec }) {
  const t = spec.theme;
  const colors: Array<[string, string]> = [
    ["背景", t.bg], ["カード", t.card], ["文字", t.ink], ["見出し", t.primary], ["アクセント", t.accent], ["帯", t.bar]
  ];
  return (
    <div className="stack gap-8">
      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
        {colors.map(([label, color]) => (
          <span key={label} className="stack gap-2" style={{ alignItems: "center" }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, background: color, border: "1px solid rgba(0,0,0,.15)" }} title={color} />
            <span className="muted small">{label}</span>
          </span>
        ))}
      </div>
      {t.accentAlternates.length > 0 ? (
        <div className="row gap-8" style={{ alignItems: "center" }}>
          <span className="muted small">投稿ごとに使うアクセント:</span>
          {[t.accent, ...t.accentAlternates].map((color) => (
            <span key={color} style={{ width: 22, height: 22, borderRadius: 11, background: color, border: "1px solid rgba(0,0,0,.15)" }} title={color} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const STRUCTURE_LABEL: Record<DesignSpec["layout"]["structure"], string> = {
  classic: "クラシック (番号・見出し・本文を縦に配置)",
  split: "スプリット (左に番号、右に見出しと本文)",
  banner: "バナー (見出しを帯にして上に配置)"
};

const VARIETY_LABEL: Record<DesignSpec["layout"]["variety"], string> = {
  none: "変えない",
  subtle: "少しだけ (色・番号の位置)",
  lively: "大きめ (+下線・装飾)"
};

export function DesignPage() {
  const { accounts, activeAccountId, apiReady, notify } = useWorkspace();
  const account = accounts.find((a) => a.id === activeAccountId);
  const [design, setDesign] = useState<AccountDesignView | null>(null);
  const [screenshots, setScreenshots] = useState<readonly string[]>([]);
  const [guideline, setGuideline] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [busy, setBusy] = useState<"analyze" | "save" | null>(null);

  const adopt = useCallback((next: AccountDesignView) => {
    setDesign(next);
    setGuideline(next.guideline);
    setReferenceNote(next.referenceNote);
  }, []);

  useEffect(() => {
    if (!apiReady || !activeAccountId) return;
    let cancelled = false;
    setScreenshots([]);
    getAccountDesign(activeAccountId)
      .then(({ design: loaded }) => {
        if (!cancelled) adopt(loaded);
      })
      .catch((error: unknown) => notify(errorText(error, "デザインを取得できませんでした")));
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, apiReady, adopt, notify]);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, MAX_SCREENSHOTS - screenshots.length);
    event.target.value = "";
    try {
      const added = await Promise.all(files.map(toScreenshot));
      setScreenshots((current) => [...current, ...added].slice(0, MAX_SCREENSHOTS));
    } catch (error) {
      notify(errorText(error, "画像を追加できませんでした"));
    }
  };

  const analyze = async () => {
    setBusy("analyze");
    try {
      const { design: next } = await analyzeAccountDesign(activeAccountId, {
        screenshots: [...screenshots],
        guideline,
        referenceNote
      });
      adopt(next);
      setScreenshots([]);
      notify("デザインを作成しました。以降の投稿に反映されます");
    } catch (error) {
      notify(errorText(error, "デザインを作成できませんでした"));
    } finally {
      setBusy(null);
    }
  };

  const saveNotes = async () => {
    setBusy("save");
    try {
      const { design: next } = await saveAccountDesignNotes(activeAccountId, { guideline, referenceNote });
      adopt(next);
      notify("ガイドラインを保存しました");
    } catch (error) {
      notify(errorText(error, "保存に失敗しました"));
    } finally {
      setBusy(null);
    }
  };

  const canAnalyze = apiReady && busy === null && (screenshots.length > 0 || guideline.trim().length > 0);

  return (
    <>
      <PageTopbar title="デザイン" />
      <div className="split">
        <section className="pane list-pane wide pad-32">
          <div className="stack gap-16">
            <div className="stack gap-8">
              <h3 className="pane-title">1. 参考にする投稿</h3>
              <p className="muted small" style={{ margin: 0 }}>
                参考アカウントの投稿のスクリーンショットを追加してください(最大{MAX_SCREENSHOTS}枚)。AIが色・太さ・角丸・装飾の雰囲気を読み取ります。文章や画像はコピーしません。
              </p>
              <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                {screenshots.map((src, index) => (
                  <span key={src.slice(-40) + index} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                    <img src={src} alt={`参考 ${index + 1}`} width={72} style={{ borderRadius: 6, display: "block" }} />
                    <button
                      className="icon-btn"
                      aria-label="この画像を外す"
                      style={{ position: "absolute", top: -6, right: -6 }}
                      onClick={() => setScreenshots((current) => current.filter((_, i) => i !== index))}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                ))}
                {screenshots.length < MAX_SCREENSHOTS ? (
                  <label className="btn outline sm" style={{ cursor: "pointer" }}>
                    <Icon name="upload" size={12} />
                    スクリーンショットを追加
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e)} />
                  </label>
                ) : null}
              </div>
              <input
                className="input"
                placeholder="参考アカウント (@handle または instagram.com/…) — メモとして保存します"
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
              />
              <p className="muted small" style={{ margin: 0 }}>
                Instagram のリンクからは画像を取得しません。リンクは出典メモとして保存されるだけです。
              </p>
            </div>

            <div className="stack gap-8">
              <h3 className="pane-title">2. デザインのガイドライン</h3>
              <textarea
                className="textarea"
                rows={5}
                placeholder="例: 清潔感のある青系。見出しは太く大きく。絵文字は使わない。ポップになりすぎない"
                value={guideline}
                onChange={(e) => setGuideline(e.target.value)}
              />
            </div>

            <div className="row gap-8">
              <button className="btn primary grow" disabled={!canAnalyze} onClick={() => void analyze()}>
                <Icon name="sparkles" size={14} />
                {busy === "analyze" ? "作成中…" : design?.hasDesign ? "デザインを作り直す" : "デザインを作成"}
              </button>
              <button className="btn outline" disabled={!apiReady || busy !== null} onClick={() => void saveNotes()}>
                {busy === "save" ? "保存中…" : "文章だけ保存"}
              </button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              3. 投稿を作るたびに、AIがこのデザインをもとにアクセントなどを少しだけ変えます。気に入らない投稿は、エディタの「デザインを再生成」でプロンプトを入れて作り直せます。
            </p>
          </div>
        </section>

        <section className="pane grow pad-32">
          {!apiReady ? <p className="empty">API未接続です</p> : null}
          {apiReady && design === null ? <p className="empty">読み込み中…</p> : null}
          {design ? (
            <div className="stack gap-16">
              <div>
                <h2 className="detail-title lg">{account?.title ?? "現在のデザイン"}</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  {design.hasDesign ? design.summary || "デザインが設定されています" : "まだデザインがありません。標準のデザインで生成されます"}
                </p>
                {design.analysisCostUsd > 0 ? (
                  <p className="muted small" style={{ margin: 0 }}>デザイン作成コスト ${design.analysisCostUsd.toFixed(3)}</p>
                ) : null}
              </div>
              <Swatches spec={design.spec} />
              <ul className="bullets small">
                <li>見出しの太さ: {design.spec.type.headWeight} / 本文: {design.spec.type.bodyWeight}</li>
                <li>角丸: {design.spec.layout.radius}px · 枠: {design.spec.layout.frame} · 装飾: {design.spec.layout.decor}</li>
                <li>ページ構成: {STRUCTURE_LABEL[design.spec.layout.structure]}</li>
                <li>番号の位置: {design.spec.layout.numberAlign} · 見出しの下線: {design.spec.type.underlineHeads ? "あり" : "なし"}</li>
                <li>投稿ごとの変化: {VARIETY_LABEL[design.spec.layout.variety]}</li>
              </ul>
              <div className="row gap-12" style={{ flexWrap: "wrap" }}>
                {PREVIEW_PAGES.map((index) => (
                  <SlidePreview key={index} spec={design.spec} index={index} handle={account?.handle ?? "@account"} />
                ))}
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                プレビューはサンプル文章で表示しています。実際の投稿は Canva に取り込まれ、Canva でも手直しできます。
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
