"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icon";
import { TemplateDraftPanel } from "../template-draft-panel";
import { PageTopbar } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { listBrandTemplates, type BrandTemplate } from "../../lib/api";
import { canvaTemplateUrl } from "../../lib/canva";
import { AUTOFILL_FIELDS } from "../../lib/slides";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function TemplatesPage() {
  const { accounts, activeAccountId, saveCanvaTemplate, notify, apiReady, integrations } = useWorkspace();
  const account = accounts.find((a) => a.id === activeAccountId);
  const [templates, setTemplates] = useState<readonly BrandTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return listBrandTemplates()
      .then((res) => setTemplates(res.items))
      .catch((e: unknown) => setError(errorText(e, "テンプレートを取得できませんでした")));
  }, []);

  useEffect(() => {
    if (apiReady) void load();
  }, [apiReady, load]);

  const appliedId = account?.canvaTemplateId ?? "";
  const selected =
    templates?.find((t) => t.id === selectedId) ?? templates?.find((t) => t.id === appliedId) ?? templates?.[0] ?? null;
  const isApplied = selected !== null && selected.id === appliedId;

  const apply = async () => {
    if (!selected || !account) return;
    setApplying(true);
    try {
      await saveCanvaTemplate(account.id, selected.id);
      notify("テンプレートを適用しました");
    } catch (e) {
      notify(errorText(e, "テンプレートの適用に失敗しました"));
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <PageTopbar title="テンプレート">
        <button
          className="btn outline"
          disabled={!apiReady}
          onClick={() => void load().then(() => notify("Canvaと再同期しました"))}
        >
          Canvaと再同期
        </button>
        <a className="btn primary" href="#template-draft">
          <Icon name="plus" size={14} />
          テンプレートを追加
        </a>
      </PageTopbar>
      <div className="split">
        <section className="pane list-pane wide">
          <div className="pane-head">
            <h3 className="pane-title">テンプレート一覧</h3>
            <p className="muted small">1アカウントにつき、1つのブランドテンプレートを適用できます</p>
          </div>
          {error ? <p className="empty">テンプレート一覧を取得できません(Canva連携を確認): {error}</p> : null}
          {!error && templates === null ? <p className="empty">{apiReady ? "読み込み中…" : "API未接続です"}</p> : null}
          <ul className="plain-list tpl-list">
            {templates?.map((tpl) => (
              <li key={tpl.id}>
                <button className={`tpl-card${tpl.id === selected?.id ? " selected" : ""}`} onClick={() => setSelectedId(tpl.id)}>
                  <span className="tpl-thumb">
                    {tpl.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed Canva CDN URLs
                      <img src={tpl.thumbnailUrl} alt="" />
                    ) : (
                      <Icon name="image" size={18} />
                    )}
                  </span>
                  <span className="stack gap-2">
                    <strong>{tpl.title}</strong>
                    <span className="muted small">{tpl.id === appliedId ? "適用中" : "未適用"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="status-box">
            <span className={`status-dot ${integrations?.canva ? "ok" : "wait"}`} />
            <div>
              <strong>Canva {integrations?.canva ? "接続済み" : "未接続"}</strong>
              <p className="muted small">OAuthユーザー連携 · ブランドテンプレートを取得します</p>
            </div>
          </div>
        </section>

        <section className="pane grow pad-32 tpl-detail">
          {selected ? (
            <>
              <div className="row between top">
                <div>
                  <h2 className="detail-title lg">{selected.title}</h2>
                  <p className="muted small">Canva テンプレートID {selected.id}</p>
                </div>
                <a className="link small" href={canvaTemplateUrl(selected.id)} target="_blank" rel="noreferrer">
                  Canvaで開く
                </a>
              </div>
              {selected.thumbnailUrl ? (
                <div className="tpl-hero">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed Canva CDN URLs */}
                  <img src={selected.thumbnailUrl} alt={selected.title} />
                </div>
              ) : null}
              <div className="row between pad-t-16">
                <h4>差し込みフィールド(Autofill)</h4>
                <span className="muted small">全 {AUTOFILL_FIELDS.length}項目 · 必須</span>
              </div>
              <div className="table">
                <div className="trow head cols-fields">
                  <span>フィールドID</span>
                  <span>用途</span>
                  <span>文字数上限</span>
                </div>
                {AUTOFILL_FIELDS.map((field) => (
                  <div className="trow cols-fields static" key={field.key}>
                    <code>{field.key}</code>
                    <span className="muted">{field.label}</span>
                    <span>{field.limit}字</span>
                  </div>
                ))}
              </div>
              <div className="two-tiles">
                <div className="note-box roomy">
                  <strong>このアカウントに適用</strong>
                  <p className="muted small">{account ? `${account.handle} に ${selected.title} を使います` : "アカウントがありません"}</p>
                  <button className="btn primary block" disabled={applying || isApplied || !account} onClick={() => void apply()}>
                    {applying ? "検証中…" : isApplied ? "適用中です" : "テンプレートを適用"}
                  </button>
                  <p className="muted small">s1_title〜s8_cta の21項目が必要です。不足があると適用できません。</p>
                </div>
                <div className="note-box roomy" id="template-draft">
                  <TemplateDraftPanel defaultOpen onRefreshTemplates={() => void load()} />
                </div>
              </div>
            </>
          ) : (
            <p className="empty">テンプレートを選択してください</p>
          )}
        </section>
      </div>
    </>
  );
}
