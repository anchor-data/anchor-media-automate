"use client";

import type { GenerationReport } from "@ama/shared";
import { SLIDES } from "../lib/slides";

const FIELD_LABEL = new Map(SLIDES.flatMap((slide) => slide.fields.map((field) => [field.key as string, `${slide.index}枚目 ${field.label}`] as const)));

/** What the last generation did: did it honor the instructions, and what changed from the previous deck. */
export function GenerationReportPanel({ report }: { report: GenerationReport }) {
  if (report.checks.length === 0 && report.diff.length === 0) return null;
  return (
    <div className="note-box stack gap-8" aria-label="生成結果の確認">
      {report.checks.length > 0 ? (
        <>
          <strong>指示の反映確認</strong>
          <ul className="plain-list">
            {report.checks.map((check) => (
              <li key={check.key}>
                <span aria-hidden>{check.ok ? "✅" : "⚠️"}</span> {check.label}
                {check.ok ? "" : " — 反映されていません"}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {report.diff.length > 0 ? (
        <>
          <strong>前回との差分 ({report.diff.length}項目)</strong>
          <ul className="plain-list">
            {report.diff.map((change) => (
              <li key={change.field} className="small">
                <span className="muted">{FIELD_LABEL.get(change.field) ?? change.field}: </span>
                <del>{change.before || "(空)"}</del> → <ins>{change.after || "(空)"}</ins>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
