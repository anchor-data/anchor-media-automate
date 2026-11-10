"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { slideFieldsSchema, type SlideFields } from "@ama/shared";
import { Icon } from "../icon";
import { RegenerateModal } from "../modals/regenerate-modal";
import { SlideTile } from "../slide-tile";
import { PageTopbar, Tabs } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { canvaDesignUrl } from "../../lib/canva";
import { totalCost } from "@ama/shared";
import type { MockPost } from "../../lib/mock-data";
import { STAGE_LABEL, stageOf } from "../../lib/post-stage";
import { useExpiredPreviewRefresh } from "../use-expired-preview-refresh";
import { formatWaiting } from "../../lib/schedule";
import { limitOf, slideDefs, slideHeadline, type SlideFieldKey } from "../../lib/slides";

type EditorTab = "slides" | "caption" | "history";

const GENERATION_LABEL: Record<string, string> = {
  pending: "生成を待機中…",
  generating_copy: "スライドの文章を作成中…",
  rendering: "Canvaで画像を生成中…"
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "不明なエラー";
}

function sameSlides(a: SlideFields | undefined, b: SlideFields | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function EditorBody({ post }: { post: MockPost }) {
  const router = useRouter();
  const { savePostSlides, savePostCaption, retryGeneration, reloadPostAssets, selectPost, notify } = useWorkspace();
  const [tab, setTab] = useState<EditorTab>("slides");
  const [active, setActive] = useState(0);
  const [fields, setFields] = useState<SlideFields | undefined>(post.slides);
  const [caption, setCaption] = useState(post.caption);
  const [saving, setSaving] = useState(false);
  const [regen, setRegen] = useState<"all" | "slide" | null>(null);
  /** Page being regenerated on its own; the other pages keep showing their current image. */
  const refreshExpiredPreview = useExpiredPreviewRefresh(post.id);
  const [singlePage, setSinglePage] = useState<number | null>(null);

  // Server copy arrives after generation or re-render; adopt it unless the user is mid-edit.
  const serverSlides = post.slides;
  useEffect(() => {
    setFields((current) => (sameSlides(current, serverSlides) ? current : (serverSlides ?? current)));
  }, [serverSlides]);

  const stage = stageOf(post);
  const editable = post.rawStatus === undefined || post.rawStatus === "draft";
  const generating = post.generationStatus ? post.generationStatus in GENERATING_SET : false;
  useEffect(() => {
    if (!generating) setSinglePage(null);
  }, [generating]);
  const SLIDES = slideDefs(post.structure);
  const slideDef = SLIDES[active] ?? SLIDES[0]!;
  const dirtySlides = !sameSlides(fields, serverSlides);
  const dirtyCaption = caption !== post.caption;
  const designUrl = canvaDesignUrl(post.canvaDesignId);
  const totalChars = fields ? slideDef.fields.reduce((sum, f) => sum + (fields[f.key]?.length ?? 0), 0) : 0;

  const updateField = (key: SlideFieldKey, value: string) =>
    setFields((current) => (current ? { ...current, [key]: value } : current));

  const saveSlides = async () => {
    const parsed = slideFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      notify("文字数の上限を超えている項目があります");
      return;
    }
    setSaving(true);
    try {
      await savePostSlides(post.id, parsed.data);
      notify("スライドを更新しました");
    } catch (error) {
      notify(`更新に失敗しました: ${errorText(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const saveCaption = async () => {
    setSaving(true);
    try {
      await savePostCaption(post.id, caption);
      notify("キャプションを保存しました");
    } catch (error) {
      notify(`保存に失敗しました: ${errorText(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmRegenerate = (instruction: string) => {
    const scope = regen;
    setRegen(null);
    if (scope === "slide") {
      setSinglePage(active);
      void retryGeneration(post.id, `スライド${active + 1}(${slideHeadline(fields, active, post.structure)})を次の指示で変更してください: ${instruction}`, active);
      return;
    }
    void retryGeneration(post.id, instruction || undefined);
  };

  const previewUrl = post.assetUrls?.[active];
  const headline = slideHeadline(fields, active, post.structure);

  return (
    <>
      <PageTopbar
        title={
          <span className="crumbs">
            <Link href="/pipeline">制作パイプライン</Link>
            <span className="muted">/</span>
            <strong>{post.title}</strong>
            <span className={`pill ${stage}`}>{STAGE_LABEL[stage]}</span>
          </span>
        }
      >
        <button
          className="btn primary"
          disabled={!editable || post.generationStatus !== "ready"}
          onClick={() => {
            selectPost(post.id);
            router.push("/review");
          }}
        >
          承認して予約へ
        </button>
      </PageTopbar>

      {!editable ? <div className="banner info">この投稿は{STAGE_LABEL[stage]}のため編集できません(下書きのみ編集可能)。</div> : null}

      <div className="split editor">
        <div className="thumb-rail" aria-label="スライド一覧">
          {SLIDES.map((slide, i) => (
            <SlideTile
              key={slide.index}
              index={i}
              url={post.assetUrls?.[i]}
              onImageError={refreshExpiredPreview}
              active={i === active}
              onSelect={() => setActive(i)}
            />
          ))}
        </div>

        <section className="pane grow canvas">
          <div className="canvas-inner">
            <div className="canvas-head">
              <strong>
                スライド {active + 1} / {SLIDES.length} · {slideDef.role}
              </strong>
              <span className="muted small">4:5 · 1080×1350</span>
            </div>
            {generating && !(singlePage !== null && singlePage !== active && previewUrl) ? (
              <div className="preview empty-preview">
                <span className="muted">{GENERATION_LABEL[post.generationStatus ?? "pending"]}</span>
              </div>
            ) : post.generationStatus === "failed" ? (
              <div className="preview empty-preview">
                <span className="muted">生成に失敗しました{post.generationError ? `: ${post.generationError}` : ""}</span>
                <button className="btn outline" onClick={() => void retryGeneration(post.id)}>
                  再生成する
                </button>
              </div>
            ) : previewUrl ? (
              <div className="preview">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Canva CDN URLs, not optimizable */}
                <img src={previewUrl} alt={`スライド ${active + 1}`} onError={refreshExpiredPreview} />
              </div>
            ) : (
              <div className={`preview text-preview ${active === 0 ? "dark" : active === 7 ? "accent" : "light"}`}>
                <span className="preview-tag">PAGE {String(active + 1).padStart(2, "0")}</span>
                <span className="preview-headline">{headline || post.title}</span>
              </div>
            )}
            <div className="counters small muted">
              {slideDef.fields.map((f) => (
                <span key={f.key}>
                  {f.label} {fields?.[f.key]?.length ?? 0}/{limitOf(f.key, post.structure)}字
                </span>
              ))}
              <span className="ok-text strong">合計 {totalChars}字</span>
            </div>
            <div className="canva-box">
              <div className="row between">
                <span className="row gap-6">
                  <span className={`status-dot ${post.generationStatus === "ready" ? "ok" : "wait"}`} />
                  <strong>
                    {post.generationStatus === "ready"
                      ? `Canva 反映済み(生成完了 · ${post.assetUrls?.length ?? SLIDES.length}/${SLIDES.length}ページ)`
                      : GENERATION_LABEL[post.generationStatus ?? ""] ?? "Canva 未反映"}
                  </strong>
                </span>
              </div>
              <div className="row gap-8 wrap">
                <button
                  className="btn outline sm"
                  disabled={post.generationStatus !== "ready"}
                  aria-description="プレビュー画像のURLは一定時間で期限切れになります。表示されない場合は押してください。"
                  onClick={() => void reloadPostAssets(post.id)}
                >
                  プレビューを更新
                  <span
                    className="info-tip"
                    aria-hidden="true"
                    data-tip="プレビュー画像のURLは一定時間で期限切れになります。表示されない場合は「プレビューを更新」を押してください。"
                  >
                    <Icon name="info" size={14} />
                  </span>
                </button>
                {designUrl ? (
                  <a className="btn tint sm" href={designUrl} target="_blank" rel="noreferrer">
                    Canvaで開く
                    <Icon name="external-link" size={12} />
                  </a>
                ) : null}
              </div>
              {post.costUsd && totalCost(post.costUsd) > 0 ? (
                <p className="small" style={{ margin: 0 }}>
                  生成コスト <strong>${totalCost(post.costUsd).toFixed(3)}</strong>
                  <span className="muted">
                    {" "}(文章 ${post.costUsd.copy.toFixed(3)} · 画像 ${post.costUsd.images.toFixed(3)})
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="pane edit-pane">
          <div className="pad-tabs">
            <Tabs
              label="編集内容"
              value={tab}
              onChange={setTab}
              options={[
                { id: "slides", label: "スライド" },
                { id: "caption", label: "キャプション" },
                { id: "history", label: "変更履歴" }
              ]}
            />
          </div>
          <div className="detail-scroll">
            {tab === "slides" ? (
              fields ? (
                <div className="stack gap-16">
                  {slideDef.fields.map((f) => (
                    <label className="field" key={f.key}>
                      <span className="label">
                        {f.label}
                        <span className="muted small">
                          {fields[f.key]?.length ?? 0}/{limitOf(f.key, post.structure)}
                        </span>
                      </span>
                      <input
                        className="input"
                        value={fields[f.key] ?? ""}
                        maxLength={limitOf(f.key, post.structure)}
                        disabled={!editable}
                        onChange={(e) => updateField(f.key, e.target.value)}
                      />
                    </label>
                  ))}
                  <button className="btn primary" disabled={!editable || !dirtySlides || saving} onClick={() => void saveSlides()}>
                    {saving ? "Canvaに反映中…" : "変更をCanvaに反映"}
                  </button>
                </div>
              ) : (
                <p className="empty">スライドの文章はまだありません。生成が完了すると編集できます。</p>
              )
            ) : null}
            {tab === "caption" ? (
              <div className="stack gap-12">
                <label className="field">
                  <span className="label">
                    キャプション(ハッシュタグも本文に入れる)
                    <span className="muted small">{caption.length}/2200</span>
                  </span>
                  <textarea
                    className="textarea"
                    rows={12}
                    maxLength={2200}
                    disabled={!editable}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </label>
                <button className="btn primary" disabled={!editable || !dirtyCaption || saving} onClick={() => void saveCaption()}>
                  {saving ? "保存中…" : "キャプションを保存"}
                </button>
              </div>
            ) : null}
            {tab === "history" ? (
              /* MOCK: edit history is not recorded yet. */
              <ul className="history small">
                <li>
                  <strong>AIエージェント</strong> がスライドを生成しました
                  <span className="muted">{formatWaiting(post.createdAt)}</span>
                </li>
                <li>
                  <strong>編集担当</strong> がキャプションを更新しました
                  <span className="muted">{formatWaiting(post.updatedAt)}</span>
                </li>
              </ul>
            ) : null}
          </div>
          <div className="detail-foot row gap-8">
            <button className="btn outline" disabled={!editable} onClick={() => setRegen("slide")}>
              このスライドだけ再生成
            </button>
            <button className="btn outline" disabled={!editable || generating} onClick={() => setRegen("all")}>
              {SLIDES.length}枚すべて再生成
            </button>
          </div>
        </aside>
      </div>
      {regen ? (
        <RegenerateModal
          title={regen === "slide" ? `スライド${active + 1}だけ再生成` : `${SLIDES.length}枚すべて再生成`}
          description={
            regen === "slide"
              ? "このスライドの文章を、指示に沿って作り直します。ほかのスライドは変えません。"
              : "文章と画像をもう一度生成します。現在の内容は上書きされます。"
          }
          requireInstruction={regen === "slide"}
          onConfirm={confirmRegenerate}
          onClose={() => setRegen(null)}
        />
      ) : null}
    </>
  );
}

const GENERATING_SET: Record<string, true> = { pending: true, generating_copy: true, rendering: true };

export function EditorPage({ postId }: { postId: string }) {
  const { posts, loading, selectPost } = useWorkspace();
  const post = posts.find((p) => p.id === postId);

  // Opening a post loads its rendered slide images (see WorkspaceProvider).
  useEffect(() => {
    selectPost(postId);
  }, [postId, selectPost]);

  if (!post) {
    return (
      <>
        <PageTopbar title="投稿エディタ" />
        <p className="empty">{loading ? "読み込み中…" : "投稿が見つかりません"}</p>
      </>
    );
  }
  return <EditorBody key={post.id} post={post} />;
}
