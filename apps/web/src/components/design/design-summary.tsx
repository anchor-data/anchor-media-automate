"use client";

import { renderSlideHtml, SLIDE_HEIGHT, SLIDE_WIDTH } from "@ama/renderer/src/html";
import type { DesignSpec } from "@ama/renderer/src/spec";
import { varySpec } from "@ama/renderer/src/vary";
import type { SlideRole } from "@ama/shared";
import type { AccountDesignView } from "../../lib/api";
import { ROLE_LABEL } from "../../lib/slides";
import { sampleFieldsFor } from "../../lib/sample-fields";
import type { BackgroundUrls, SavedReference } from "./use-account-design";

/** The pages to show: cover, first point and closing page, plus every page a reference was assigned to. */
function samplePagesFor(structure: readonly SlideRole[], references: readonly SavedReference[]): number[] {
  const defaults = [1, structure.indexOf("point") + 1, structure.length].filter((page) => page >= 1);
  const referenced = references.map((reference) => reference.page).filter((page): page is number => page !== null && page <= structure.length);
  return [...new Set([...defaults, ...referenced])].sort((a, b) => a - b);
}

/** A content page for the variation examples (variation mostly shows on those). */
const examplePageOf = (structure: readonly SlideRole[]): number => Math.max(1, structure.indexOf("point") + 1);

/** Fixed seeds so the examples do not jump around between renders. */
const VARIATION_SEEDS = ["sample-a", "sample-b", "sample-c"] as const;

function SlidePreview({ spec, index, handle, width, backgrounds, structure }: { spec: DesignSpec; index: number; handle: string; width: number; backgrounds?: BackgroundUrls; structure: readonly SlideRole[] }) {
  const scale = width / SLIDE_WIDTH;
  return (
    <div style={{ width, height: SLIDE_HEIGHT * scale, overflow: "hidden", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,.2)" }}>
      <iframe
        title={`preview ${index}`}
        sandbox=""
        srcDoc={renderSlideHtml({ spec, index, fields: sampleFieldsFor(structure), handle, backgrounds, structure })}
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

const VARIETY_LABEL: Record<DesignSpec["layout"]["variety"], string> = {
  none: "変えない",
  subtle: "少しだけ (色・番号の位置)",
  lively: "大きめ (+下線・装飾・ページ構成)"
};

const STRUCTURE_LABEL: Record<DesignSpec["layout"]["structure"], string> = {
  classic: "クラシック (番号・見出し・本文を縦に配置)",
  split: "スプリット (左に番号、右に見出しと本文)",
  banner: "バナー (見出しを帯にして上に配置)"
};

interface DesignSummaryProps {
  design: AccountDesignView;
  handle: string;
  /** Preview width in px of each sample page. */
  previewWidth?: number;
  /** Background artwork urls by page role; the sample pages are drawn on top of them. */
  backgrounds?: BackgroundUrls;
  /** Saved reference screenshots; the ones that name a page are shown next to that page of the sample. */
  references?: readonly SavedReference[];
}

/** The saved design at a glance: description, colors, key settings, page structure and sample pages. */
export function DesignSummary({ design, handle, previewWidth = 220, backgrounds, references = [] }: DesignSummaryProps) {
  const { spec, structure } = design;
  const samplePages = samplePagesFor(structure, references);
  return (
    <div className="stack gap-16">
      <div>
        <p className="muted small" style={{ margin: 0 }}>
          {design.hasDesign ? design.summary || "デザインが設定されています" : "まだデザインがありません。標準のデザインで生成されます"}
        </p>
        {design.analysisCostUsd > 0 ? <p className="muted small" style={{ margin: 0 }}>作成コスト ${design.analysisCostUsd.toFixed(3)}</p> : null}
      </div>
      <Swatches spec={spec} />
      <ul className="bullets small">
        <li>見出しの太さ: {spec.type.headWeight} / 本文: {spec.type.bodyWeight}</li>
        <li>角丸: {spec.layout.radius}px · 枠: {spec.layout.frame} · 装飾: {spec.layout.decor}</li>
        <li>ページの配置: {STRUCTURE_LABEL[spec.layout.structure]}</li>
        <li>番号の位置: {spec.layout.numberAlign} · 見出しの下線: {spec.type.underlineHeads ? "あり" : "なし"}</li>
        <li>投稿ごとの変化: {VARIETY_LABEL[spec.layout.variety]}</li>
        {Object.keys(spec.roles).length > 0 ? (
          <li>ページの種類ごとの違い: {(Object.keys(spec.roles) as SlideRole[]).map((role) => ROLE_LABEL[role]).join("・")}(色・枠・装飾などを個別に設定)</li>
        ) : null}
        <li>
          スライド構成: {design.structure.length}枚 ({design.structure.map((role) => ROLE_LABEL[role]).join(" → ")})
          {design.structureSummary ? <span className="muted"> — {design.structureSummary}</span> : null}
        </li>
      </ul>
      <div className="row gap-12" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
        {samplePages.map((page) => {
          const matching = references.filter((reference) => reference.page === page);
          return (
            <div key={page} className="stack gap-4">
              <span className="muted small">{page}ページ目 · {ROLE_LABEL[structure[page - 1]!]}</span>
              <div className="row gap-8" style={{ alignItems: "flex-start" }}>
                {matching.length > 0 ? (
                  <div className="stack gap-4" title="このページとして指定した参考画像">
                    {matching.map((reference) => (
                      // eslint-disable-next-line @next/next/no-img-element -- served by the API
                      <img key={reference.name} src={reference.url} alt={`${page}ページ目の参考画像`} width={Math.round(previewWidth * 0.45)} style={{ borderRadius: 6, display: "block" }} />
                    ))}
                    <span className="muted small">参考</span>
                  </div>
                ) : null}
                <SlidePreview spec={spec} index={page} handle={handle} width={previewWidth} backgrounds={backgrounds} structure={structure} />
              </div>
            </div>
          );
        })}
      </div>
      {spec.layout.variety !== "none" ? (
        <div className="stack gap-8">
          <span className="muted small">投稿ごとの変化の例(同じデザインから、色・配置・背景を少しずつ変えます)</span>
          <div className="row gap-12" style={{ flexWrap: "wrap" }}>
            {VARIATION_SEEDS.map((seed) => (
              <SlidePreview key={seed} spec={varySpec(spec, seed)} index={examplePageOf(structure)} handle={handle} width={previewWidth} backgrounds={backgrounds} structure={structure} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
