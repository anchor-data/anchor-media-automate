"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icon";
import { PageTopbar } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { DesignSummary } from "../design/design-summary";
import { PageSelect } from "../design/screenshot-picker";
import { StructureBoard, type BoardRow } from "../design/structure-board";
import { structureIssues } from "../design/structure-editor";
import { useAccountDesign } from "../design/use-account-design";
import { ROLE_LABEL } from "../../lib/slides";

export function DesignPage() {
  const { accounts, activeAccountId, apiReady } = useWorkspace();
  const account = accounts.find((a) => a.id === activeAccountId);
  const state = useAccountDesign(activeAccountId);
  const { design, busy } = state;

  // The pages being edited. Each row keeps its id while dragged, so its reference images follow it.
  const [rows, setRows] = useState<BoardRow[]>([]);
  const designLoaded = design !== null;
  useEffect(() => {
    if (design) setRows(design.structure.map((role) => ({ id: crypto.randomUUID(), role })));
    // Start over only when another account's design arrives, not after every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, designLoaded]);

  const roles = rows.map((row) => row.role);
  const structureValid = structureIssues(roles).length === 0;
  const structureChanged = design !== null && JSON.stringify(design.structure) !== JSON.stringify(roles);
  const canAnalyze = apiReady && busy === null && structureValid && (state.referenceUrls.length > 0 || state.guideline.trim().length > 0);

  /** New page list: images of moved pages get new page numbers, images of removed pages are deleted. */
  const changeRows = (next: BoardRow[]) => {
    const moves: Array<{ name: string; page: number }> = [];
    const removals: string[] = [];
    for (const reference of state.referenceUrls) {
      const id = reference.page === null ? undefined : rows[reference.page - 1]?.id;
      if (id === undefined) continue;
      const index = next.findIndex((row) => row.id === id);
      if (index < 0) removals.push(reference.name);
      else if (index + 1 !== reference.page) moves.push({ name: reference.name, page: index + 1 });
    }
    setRows(next);
    void state.syncReferences(moves, removals);
  };

  /** Save the guideline and the page structure (the design itself is not re-derived). */
  const persist = async (): Promise<boolean> => {
    // Notes first: every save reloads the form from the server, so unsaved text would be lost otherwise.
    if (!(await state.saveNotes())) return false;
    // The structure has to be saved before a rebuild: the server reads each screenshot's page against it.
    return !structureChanged || (await state.saveStructure(roles));
  };

  const saveOnly = async () => {
    await persist();
  };

  const rebuild = async () => {
    if (!(await persist())) return;
    await state.analyze([], []);
  };

  const unassigned = state.referenceUrls.filter((reference) => reference.page === null || reference.page > rows.length);
  const pageOptions = rows.map((row, index) => ({ value: index + 1, label: `${index + 1}ページ目 ${ROLE_LABEL[row.role]}` }));

  return (
    <>
      <PageTopbar title="デザインテンプレート" />
      <div className="split">
        <section className="pane list-pane wide pad-32">
          <div className="stack gap-16">
            <div className="stack gap-8">
              <h3 className="pane-title">1. デザインのガイドライン</h3>
              <textarea className="textarea" rows={5} placeholder="例: 清潔感のある青系。見出しは太く大きく。絵文字は使わない。ポップになりすぎない" value={state.guideline} onChange={(e) => state.setGuideline(e.target.value)} />
              <input className="input" placeholder="参考アカウント (@handle または instagram.com/…) — 出典メモ" value={state.referenceNote} onChange={(e) => state.setReferenceNote(e.target.value)} />
              <p className="muted small" style={{ margin: 0 }}>リンクは出典メモとして保存されるだけで、画像は取得しません。参考の投稿は、下のスライド構成の各ページに画像で添付してください。</p>
            </div>

            <div className="stack gap-8">
              <h3 className="pane-title">2. スライド構成と参考にする投稿</h3>
              <p className="muted small" style={{ margin: 0 }}>
                1投稿のページ数と並びです(3〜10枚)。ページごとに、見た目の参考にする投稿のスクリーンショットを添付できます(最大8枚)。AIが色・太さ・角丸・装飾の雰囲気と、ページごとの背景アートを読み取ります。文章や画像はコピーしません。ページは左のつまみをドラッグして並べ替えます。
              </p>
              <StructureBoard
                rows={rows}
                references={state.referenceUrls}
                onRowsChange={changeRows}
                onAttach={(files, page) => void state.attachReferences(files, page)}
                onRemoveReference={(name) => void state.syncReferences([], [name])}
                disabled={busy !== null || !apiReady}
              />
              {unassigned.length > 0 ? (
                <div className="stack gap-8">
                  <span className="muted small">ページが決まっていない参考画像です。何ページ目か選ぶと、そのページに移ります</span>
                  <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                    {unassigned.map(({ name, url }) => (
                      <span key={name} className="stack gap-4" style={{ position: "relative" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
                        <img src={url} alt="ページ未指定の参考画像" width={64} style={{ borderRadius: 6, display: "block" }} />
                        <button className="icon-btn" aria-label="この画像を削除" disabled={busy !== null} style={{ position: "absolute", top: -6, right: -6 }} onClick={() => void state.syncReferences([], [name])}>
                          <Icon name="x" size={12} />
                        </button>
                        <PageSelect value={0} options={pageOptions} disabled={busy !== null} onChange={(page) => page > 0 && void state.syncReferences([{ name, page }], [])} />
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="row gap-8">
              <button className="btn primary grow" disabled={!canAnalyze} onClick={() => void rebuild()}>
                <Icon name="sparkles" size={14} />
                {busy === "analyze" ? "作成中…" : busy === "backgrounds" ? "背景を作成中…" : design?.hasDesign ? "デザインを作り直す" : "デザインを作成"}
              </button>
              <button className="btn outline" disabled={!apiReady || busy !== null || !structureValid} onClick={() => void saveOnly()}>
                {busy === "save" || busy === "structure-save" ? "保存中…" : "保存だけする"}
              </button>
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
              <DesignSummary design={design} handle={account?.handle ?? "@account"} backgrounds={state.backgrounds} references={state.referenceUrls} />
              {state.backgroundsEnabled ? (
                <div className="row gap-8" style={{ alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn outline sm" disabled={!apiReady || busy !== null || !design.hasDesign} onClick={() => void state.regenerateBackgrounds()}>
                    {busy === "backgrounds" ? "背景を作成中…" : state.backgroundCount > 0 ? "背景アートを作り直す" : "背景アートを作成"}
                  </button>
                  {state.backgroundProgress ? (
                    <span className="muted small">{state.backgroundProgress.done + 1} / {state.backgroundProgress.total} ページ分を作成中(1ページ30秒ほど)</span>
                  ) : (
                    <span className="muted small">参考画像の雰囲気で背景を作り、見本と投稿に使います</span>
                  )}
                </div>
              ) : null}
              <p className="muted small" style={{ margin: 0 }}>プレビューはサンプル文章で表示しています。実際の投稿は Canva に取り込まれ、Canva でも手直しできます。</p>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
