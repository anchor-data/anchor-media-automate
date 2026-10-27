"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { slideFieldsSchema, type SlideFields } from "@ama/shared";
import { Icon } from "../icon";
import { SlideTile } from "../slide-tile";
import { PageTopbar, Tabs } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import { canvaDesignUrl } from "../../lib/canva";
import type { MockPost } from "../../lib/mock-data";
import { STAGE_LABEL, stageOf } from "../../lib/post-stage";
import { formatWaiting } from "../../lib/schedule";
import { SLIDES, limitOf, slideHeadline, type SlideFieldKey } from "../../lib/slides";

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
  const [sendingBack, setSendingBack] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Server copy arrives after generation or re-render; adopt it unless the user is mid-edit.
  const serverSlides = post.slides;
  useEffect(() => {
    setFields((current) => (sameSlides(current, serverSlides) ? current : (serverSlides ?? current)));
  }, [serverSlides]);

  const stage = stageOf(post);
  const editable = post.rawStatus === undefined || post.rawStatus === "draft";
  const generating = post.generationStatus ? post.generationStatus in GENERATING_SET : false;
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

  const regenerateAll = () => {
    if (window.confirm("文章と画像をもう一度生成します。現在の内容は上書きされます。よろしいですか？")) {
      void retryGeneration(post.id);
    }
  };

  const sendBack = async () => {
    if (!feedback.trim()) {
      notify("差し戻しの理由を入力してください");
      return;
    }
    await retryGeneration(post.id, feedback.trim());
    notify("差し戻して再生成を開始しました");
    setSendingBack(false);
    setFeedback("");
  };

  const previewUrl = post.assetUrls?.[active];
  const headline = slideHeadline(fields, active);

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
        <span className="muted small">
          {post.generationStatus === "ready" ? `Canva 反映済み · ${formatWaiting(post.updatedAt ?? post.createdAt)}` : "Canva 未反映"}
        </span>
        {editable ? (
          <button className="btn outline" onClick={() => setSendingBack((v) => !v)}>
            差し戻す
          </button>
        ) : null}
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

      {sendingBack ? (
        <div className="banner">
          <textarea
            className="textarea"
            rows={2}
            aria-label="差し戻しの理由"
            placeholder="修正してほしい点(エージェントが反映して再生成します)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <button className="btn primary" onClick={() => void sendBack()}>
            この内容で再生成
          </button>
        </div>
      ) : null}
      {!editable ? <div className="banner info">この投稿は{STAGE_LABEL[stage]}のため編集できません(下書きのみ編集可能)。</div> : null}

      <div className="split editor">
        <div className="thumb-rail" aria-label="スライド一覧">
          {SLIDES.map((slide, i) => (
            <SlideTile
              key={slide.index}
              index={i}
              url={post.assetUrls?.[i]}
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
            {generating ? (
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
                <img src={previewUrl} alt={`スライド ${active + 1}`} />
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
                  {f.label} {fields?.[f.key]?.length ?? 0}/{limitOf(f.key)}字
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
                <button className="btn outline sm" disabled={!editable || generating} onClick={regenerateAll}>
                  <Icon name="sparkles" size={12} />
                  もう一度生成
                </button>
                <button
                  className="btn outline sm"
                  disabled={post.generationStatus !== "ready"}
                  onClick={() => void reloadPostAssets(post.id)}
                >
                  プレビューを更新
                </button>
                {designUrl ? (
                  <a className="btn tint sm" href={designUrl} target="_blank" rel="noreferrer">
                    Canvaで開く
                    <Icon name="external-link" size={12} />
                  </a>
                ) : null}
              </div>
              <p className="muted small">
                プレビュー画像のURLは一定時間で期限切れになります。表示されない場合は「プレビューを更新」を押してください。「もう一度生成」は文章と画像を上書きします。
              </p>
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
                          {fields[f.key]?.length ?? 0}/{limitOf(f.key)}
                        </span>
                      </span>
                      <input
                        className="input"
                        value={fields[f.key] ?? ""}
                        maxLength={limitOf(f.key)}
                        disabled={!editable}
                        onChange={(e) => updateField(f.key, e.target.value)}
                      />
                    </label>
                  ))}
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
            {tab === "slides" ? (
              <button className="btn primary grow" disabled={!editable || !dirtySlides || saving} onClick={() => void saveSlides()}>
                {saving ? "Canvaに反映中…" : "変更をCanvaに反映"}
              </button>
            ) : null}
            <button className="btn outline" disabled={!editable} onClick={() => notify("1枚だけの再生成は準備中です")}>
              このスライドだけ再生成
            </button>
            <button className="btn outline" disabled={!editable || generating} onClick={regenerateAll}>
              {SLIDES.length}枚すべて再生成
            </button>
          </div>
        </aside>
      </div>
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
