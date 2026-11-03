"use client";

import { renderSlideHtml, SLIDE_HEIGHT, SLIDE_WIDTH } from "@ama/renderer/src/html";
import type { DesignSpec } from "@ama/renderer/src/spec";
import type { AccountDesignView } from "../../lib/api";
import { ROLE_LABEL } from "../../lib/slides";

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

function SlidePreview({ spec, index, handle, width }: { spec: DesignSpec; index: number; handle: string; width: number }) {
  const scale = width / SLIDE_WIDTH;
  return (
    <div style={{ width, height: SLIDE_HEIGHT * scale, overflow: "hidden", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,.2)" }}>
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
}

/** The saved design at a glance: description, colors, key settings, page structure and sample pages. */
export function DesignSummary({ design, handle, previewWidth = 220 }: DesignSummaryProps) {
  const { spec } = design;
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
        <li>
          スライド構成: {design.structure.length}枚 ({design.structure.map((role) => ROLE_LABEL[role]).join(" → ")})
          {design.structureSummary ? <span className="muted"> — {design.structureSummary}</span> : null}
        </li>
      </ul>
      <div className="row gap-12" style={{ flexWrap: "wrap" }}>
        {[1, 3, 8].map((index) => (
          <SlidePreview key={index} spec={spec} index={index} handle={handle} width={previewWidth} />
        ))}
      </div>
    </div>
  );
}
