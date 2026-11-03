"use client";

import Link from "next/link";
import { ROLE_LABEL } from "../../lib/slides";
import { useAccountDesign } from "./use-account-design";

/** The account's saved design and page structure at a glance, with a link to edit them (shown in the agent settings). */
export function AccountDesignCard({ accountId }: { accountId: string }) {
  const { design } = useAccountDesign(accountId);
  if (!design) return null;
  const t = design.spec.theme;
  return (
    <div className="stack gap-8">
      <div className="row between">
        <strong>デザイン・スライド構成</strong>
        <Link className="link small" href="/design">デザインを編集</Link>
      </div>
      <div className="row gap-8" style={{ alignItems: "center" }}>
        {[t.bg, t.primary, t.accent, t.bar, ...t.accentAlternates].map((color) => (
          <span key={color} style={{ width: 20, height: 20, borderRadius: 10, background: color, border: "1px solid rgba(0,0,0,.15)" }} title={color} />
        ))}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {design.hasDesign ? design.summary || "デザインが設定されています" : "デザインは未設定です(標準のデザインで生成されます)"}
      </p>
      <p className="small" style={{ margin: 0 }}>
        スライド構成: {design.structure.length}枚 ({design.structure.map((role) => ROLE_LABEL[role]).join(" → ")})
      </p>
      {design.guideline ? <p className="muted small" style={{ margin: 0 }}>ガイドライン: {design.guideline.slice(0, 120)}</p> : null}
    </div>
  );
}
