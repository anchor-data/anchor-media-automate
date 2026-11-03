"use client";

import { useState } from "react";
import { Icon } from "../icon";
import { PageTopbar } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { DesignSummary } from "../design/design-summary";
import { ScreenshotPicker } from "../design/screenshot-picker";
import { StructureEditor, structureIssues } from "../design/structure-editor";
import { useAccountDesign } from "../design/use-account-design";
import { MAX_SCREENSHOTS } from "../../lib/screenshots";

export function DesignPage() {
  const { accounts, activeAccountId, apiReady, notify } = useWorkspace();
  const account = accounts.find((a) => a.id === activeAccountId);
  const state = useAccountDesign(activeAccountId);
  const [screenshots, setScreenshots] = useState<readonly string[]>([]);
  const { design, busy } = state;

  const canAnalyze = apiReady && busy === null && (screenshots.length > 0 || state.guideline.trim().length > 0);
  const structureValid = structureIssues(state.structure).length === 0;
  const structureChanged = design !== null && JSON.stringify(design.structure) !== JSON.stringify(state.structure);

  return (
    <>
      <PageTopbar title="デザイン" />
      <div className="split">
        <section className="pane list-pane wide pad-32">
          <div className="stack gap-16">
            <div className="stack gap-8">
              <h3 className="pane-title">1. 参考にする投稿</h3>
              <p className="muted small" style={{ margin: 0 }}>
                参考アカウントの投稿のスクリーンショットを追加してください(最大{MAX_SCREENSHOTS}枚)。AIが色・太さ・角丸・装飾の雰囲気と、スライドの構成を読み取ります。文章や画像はコピーしません。
              </p>
              <ScreenshotPicker value={screenshots} onChange={setScreenshots} onError={notify} />
              <input className="input" placeholder="参考アカウント (@handle または instagram.com/…) — メモとして保存します" value={state.referenceNote} onChange={(e) => state.setReferenceNote(e.target.value)} />
              <p className="muted small" style={{ margin: 0 }}>Instagram のリンクからは画像を取得しません。リンクは出典メモとして保存されるだけです。</p>
            </div>

            <div className="stack gap-8">
              <h3 className="pane-title">2. デザインのガイドライン</h3>
              <textarea className="textarea" rows={5} placeholder="例: 清潔感のある青系。見出しは太く大きく。絵文字は使わない。ポップになりすぎない" value={state.guideline} onChange={(e) => state.setGuideline(e.target.value)} />
            </div>

            <div className="row gap-8">
              <button className="btn primary grow" disabled={!canAnalyze} onClick={() => void state.analyze(screenshots).then((ok) => ok && setScreenshots([]))}>
                <Icon name="sparkles" size={14} />
                {busy === "analyze" ? "作成中…" : design?.hasDesign ? "デザインを作り直す" : "デザインを作成"}
              </button>
              <button className="btn outline" disabled={!apiReady || busy !== null} onClick={() => void state.saveNotes()}>
                {busy === "save" ? "保存中…" : "文章だけ保存"}
              </button>
            </div>

            <div className="stack gap-8">
              <h3 className="pane-title">3. スライド構成</h3>
              <p className="muted small" style={{ margin: 0 }}>
                1投稿のページ数と並びです(3〜10枚)。参考のスクリーンショットから推定するか、手で調整できます。このアカウントの新しい投稿から反映されます。
              </p>
              <StructureEditor value={state.structure} onChange={state.setStructure} disabled={busy !== null} />
              <div className="row gap-8">
                <button className="btn outline sm" disabled={!apiReady || busy !== null || screenshots.length === 0} onClick={() => void state.analyzeStructure(screenshots)}>
                  {busy === "structure" ? "推定中…" : "参考から推定"}
                </button>
                <button className="btn primary sm" disabled={!apiReady || busy !== null || !structureValid || !structureChanged} onClick={() => void state.saveStructure()}>
                  {busy === "structure-save" ? "保存中…" : "構成を保存"}
                </button>
              </div>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              投稿を作るたびに、AIがこのデザインをもとにアクセントなどを少しだけ変えます。気に入らない投稿は、エディタの「デザインを再生成」でプロンプトを入れて作り直せます。
            </p>
          </div>
        </section>

        <section className="pane grow pad-32">
          {!apiReady ? <p className="empty">API未接続です</p> : null}
          {apiReady && design === null ? <p className="empty">読み込み中…</p> : null}
          {design ? (
            <div className="stack gap-12">
              <h2 className="detail-title lg">{account?.title ?? "現在のデザイン"}</h2>
              <DesignSummary design={design} handle={account?.handle ?? "@account"} />
              <p className="muted small" style={{ margin: 0 }}>プレビューはサンプル文章で表示しています。実際の投稿は Canva に取り込まれ、Canva でも手直しできます。</p>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
