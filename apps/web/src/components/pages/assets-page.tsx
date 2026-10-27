"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImageAsset } from "@ama/shared";
import { Icon } from "../icon";
import { PageTopbar } from "../ui/page";
import { useWorkspace } from "../workspace-context";
import {
  deleteImageAsset,
  getImageStyle,
  imageAssetFileUrl,
  listImageAssets,
  listImageSlots,
  saveImageStyle,
  uploadImageAsset
} from "../../lib/api";
import { formatMonthDay } from "../../lib/schedule";

type FolderId = "all" | "asset" | "reference";
type UploadKind = "asset" | "reference";

const KIND_LABEL: Record<string, string> = {
  asset: "そのまま配置",
  reference: "AI生成の見本",
  generated: "生成画像"
};

const MAX_UPLOAD_MB = 5;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatSize(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1000))}KB`;
}

export function AssetsPage() {
  const { activeAccountId, notify, apiReady } = useWorkspace();
  const [items, setItems] = useState<readonly ImageAsset[]>([]);
  const [folder, setFolder] = useState<FolderId>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tray, setTray] = useState(false);
  const [kind, setKind] = useState<UploadKind>("asset");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [stylePrompt, setStylePrompt] = useState("");
  const [savedStyle, setSavedStyle] = useState("");
  const [editingStyle, setEditingStyle] = useState(false);
  /** null while loading or unknown; [] means the template has no image fields. */
  const [slots, setSlots] = useState<readonly string[] | null>(null);

  useEffect(() => {
    if (!apiReady || !activeAccountId) return;
    let cancelled = false;
    listImageAssets(activeAccountId)
      .then((res) => {
        if (!cancelled) setItems(res.items.filter((item) => item.kind !== "generated"));
      })
      .catch((error: unknown) => notify(errorText(error, "画像の読み込みに失敗")));
    listImageSlots(activeAccountId)
      .then((res) => !cancelled && setSlots(res.slots))
      .catch(() => !cancelled && setSlots(null));
    getImageStyle(activeAccountId)
      .then((res) => {
        if (cancelled) return;
        setStylePrompt(res.prompt);
        setSavedStyle(res.prompt);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, apiReady, notify]);

  const counts = useMemo(
    () => ({
      all: items.length,
      asset: items.filter((i) => i.kind === "asset").length,
      reference: items.filter((i) => i.kind === "reference").length
    }),
    [items]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => folder === "all" || i.kind === folder)
      .filter((i) => !q || `${i.label} ${i.description}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items, folder, query]);

  const selected = items.find((i) => i.id === selectedId) ?? visible[0] ?? null;
  const usesImages = items.some((item) => item.kind === "asset") || savedStyle.trim().length > 0;

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_MB * 1_000_000) {
        notify(`${MAX_UPLOAD_MB}MB以下の画像を選んでください`);
        return;
      }
      setBusy(true);
      try {
        const { item } = await uploadImageAsset(activeAccountId, file, label.trim(), description.trim(), kind);
        setItems((prev) => [item, ...prev]);
        setSelectedId(item.id);
        setLabel("");
        setDescription("");
        setTray(false);
        notify("画像を追加しました");
      } catch (error) {
        notify(errorText(error, "画像のアップロードに失敗"));
      } finally {
        setBusy(false);
      }
    },
    [activeAccountId, label, description, kind, notify]
  );

  const remove = async (asset: ImageAsset) => {
    if (!window.confirm(`「${asset.label}」を削除します。よろしいですか？`)) return;
    try {
      await deleteImageAsset(asset.id);
      setItems((prev) => prev.filter((item) => item.id !== asset.id));
      setSelectedId(null);
      notify("画像を削除しました");
    } catch (error) {
      notify(errorText(error, "画像の削除に失敗"));
    }
  };

  const saveStyle = async () => {
    try {
      const res = await saveImageStyle(activeAccountId, stylePrompt);
      setSavedStyle(res.prompt);
      setEditingStyle(false);
      notify(res.prompt ? "画像の共通ルールを保存しました" : "AI画像生成をオフにしました");
    } catch (error) {
      notify(errorText(error, "保存に失敗しました"));
    }
  };

  const folders: readonly { id: FolderId; label: string; count: number }[] = [
    { id: "all", label: "すべて", count: counts.all },
    { id: "asset", label: KIND_LABEL.asset ?? "", count: counts.asset },
    { id: "reference", label: KIND_LABEL.reference ?? "", count: counts.reference }
  ];

  return (
    <>
      <PageTopbar title="アセットライブラリ">
        <label className="search-input">
          <Icon name="search" size={14} />
          <input
            type="search"
            placeholder="ファイル名・説明で検索"
            aria-label="アセットを検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={!apiReady} onClick={() => setTray((v) => !v)}>
          <Icon name="upload" size={14} />
          アップロード
        </button>
      </PageTopbar>
      <div className="split">
        <nav className="pane folder-pane" aria-label="フォルダ">
          <span className="eyebrow plain">フォルダ</span>
          {folders.map((item) => (
            <button
              key={item.id}
              className={`folder-row${folder === item.id ? " active" : ""}`}
              onClick={() => setFolder(item.id)}
            >
              <span>{item.label}</span>
              <span className="muted">{item.count}</span>
            </button>
          ))}
        </nav>

        <section className="pane grow pad-24">
          {tray ? (
            <div className="upload-tray">
              <select className="select" aria-label="画像の種類" value={kind} onChange={(e) => setKind(e.target.value === "reference" ? "reference" : "asset")}>
                <option value="asset">そのまま配置(ロゴ・写真など)</option>
                <option value="reference">AI生成の見本(スタイル・被写体の参考)</option>
              </select>
              <input className="input" placeholder="ラベル(例: オフィス外観)" value={label} onChange={(e) => setLabel(e.target.value)} />
              <input className="input" placeholder="説明(どんなスライドに合うか)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <label className="btn outline" aria-disabled={busy}>
                <Icon name="upload" size={14} />
                {busy ? "アップロード中…" : `画像を選択 (PNG / JPEG / WebP, ${MAX_UPLOAD_MB}MBまで)`}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(file);
                  }}
                />
              </label>
            </div>
          ) : null}
          <div className="row between small muted pad-b-16">
            <span>{counts.all}点</span>
            <span>並び替え: 追加日が新しい順</span>
          </div>
          {visible.length === 0 ? (
            <p className="empty">{apiReady ? "画像はまだありません。「アップロード」から追加できます。" : "API未接続のため画像を表示できません"}</p>
          ) : (
            <div className="asset-grid">
              {visible.map((asset) => (
                <button
                  key={asset.id}
                  className={`asset-card${asset.id === selected?.id ? " selected" : ""}`}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <span className="asset-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageAssetFileUrl(asset.id)} alt={asset.label} loading="lazy" />
                  </span>
                  <strong>{asset.label}</strong>
                  <span className="muted small">
                    {KIND_LABEL[asset.kind]} · {formatMonthDay(asset.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="info-cards">
            <div className="note-box">
              <div className="row between">
                <strong>AI画像生成(共通ルール)</strong>
                <button className="link small" onClick={() => setEditingStyle((v) => !v)}>
                  {editingStyle ? "閉じる" : "編集"}
                </button>
              </div>
              {editingStyle ? (
                <div className="stack gap-8">
                  <textarea
                    className="textarea"
                    rows={4}
                    aria-label="画像の共通ルール"
                    placeholder="例: フラットなパステル調のイラスト。丸い輪郭、陰影は控えめ。背景は透明。(空欄でAI画像生成オフ)"
                    value={stylePrompt}
                    onChange={(e) => setStylePrompt(e.target.value)}
                  />
                  <button className="btn primary sm" disabled={stylePrompt === savedStyle} onClick={() => void saveStyle()}>
                    共通ルールを保存
                  </button>
                </div>
              ) : (
                <p className="muted small">{savedStyle || "未設定です(AI画像生成はオフ)。毎回そろえたい被写体・画風・背景を設定できます。"}</p>
              )}
            </div>
            {slots !== null && slots.length === 0 && usesImages ? (
              <div className="note-box danger" role="alert">
                <strong>テンプレートに画像欄がありません</strong>
                <p className="small">
                  s1_image〜s8_image が未設定のため、画像は使われません。Canvaで画像欄を追加し、再公開してください。
                </p>
              </div>
            ) : slots !== null && slots.length > 0 ? (
              <div className="note-box">
                <strong>テンプレートの画像欄</strong>
                <p className="muted small">{slots.join(", ")}</p>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="pane detail-pane narrow">
          {selected ? (
            <>
              <div className="detail-scroll">
                <div className="asset-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageAssetFileUrl(selected.id)} alt={selected.label} />
                </div>
                <h3 className="detail-title">{selected.label}</h3>
                <p className="muted small">
                  {selected.contentType.replace("image/", "").toUpperCase()} · {formatSize(selected.sizeBytes)} · 追加 {formatMonthDay(selected.createdAt)}
                </p>
                <hr />
                <h4>画像の種類</h4>
                <p className="small">{KIND_LABEL[selected.kind]}</p>
                <hr />
                <h4>説明</h4>
                <p className="small muted">{selected.description || "説明はありません"}</p>
              </div>
              <div className="detail-foot row gap-8">
                <a className="btn outline grow" href={imageAssetFileUrl(selected.id)} download={selected.label}>
                  <Icon name="download" size={14} />
                  ダウンロード
                </a>
                <button className="btn danger-outline grow" onClick={() => void remove(selected)}>
                  <Icon name="trash" size={14} />
                  削除
                </button>
              </div>
            </>
          ) : (
            <p className="empty">画像を選択すると詳細が表示されます</p>
          )}
        </aside>
      </div>
    </>
  );
}
