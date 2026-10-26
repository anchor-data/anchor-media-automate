"use client";

import { useCallback, useEffect, useState } from "react";
import type { ImageAsset } from "@ama/shared";
import {
  deleteImageAsset,
  getImageStyle,
  imageAssetFileUrl,
  listImageAssets,
  listImageSlots,
  saveImageStyle,
  uploadImageAsset
} from "../lib/api";
import { Icon } from "./icon";

interface ImageLibraryProps {
  accountId: string;
  notify: (message: string) => void;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Images the creation agent may place into Canva slides (needs s{n}_image fields on the template). */
export function ImageLibrary({ accountId, notify }: ImageLibraryProps) {
  const [items, setItems] = useState<readonly ImageAsset[]>([]);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"asset" | "reference">("asset");
  const [stylePrompt, setStylePrompt] = useState("");
  const [savedStyle, setSavedStyle] = useState("");
  /** null while loading or unknown; [] means the template has no image fields. */
  const [slots, setSlots] = useState<readonly string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listImageAssets(accountId)
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((error: unknown) => notify(errorText(error, "画像の読み込みに失敗")));
    return () => {
      cancelled = true;
    };
  }, [accountId, notify]);

  useEffect(() => {
    let cancelled = false;
    listImageSlots(accountId)
      .then((res) => {
        if (!cancelled) setSlots(res.slots);
      })
      .catch(() => {
        if (!cancelled) setSlots(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;
    getImageStyle(accountId)
      .then((res) => {
        if (cancelled) return;
        setStylePrompt(res.prompt);
        setSavedStyle(res.prompt);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const saveStyle = useCallback(async () => {
    try {
      const res = await saveImageStyle(accountId, stylePrompt);
      setSavedStyle(res.prompt);
      notify(res.prompt ? "画像の共通ルールを保存しました" : "AI画像生成をオフにしました");
    } catch (error) {
      notify(errorText(error, "保存に失敗しました"));
    }
  }, [accountId, stylePrompt, notify]);

  /** Images are in play when the library has something to place or AI generation is switched on. */
  const usesImages = items.some((item) => item.kind === "asset") || savedStyle.trim().length > 0;

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const { item } = await uploadImageAsset(accountId, file, label.trim(), description.trim(), kind);
        setItems((prev) => [item, ...prev]);
        setLabel("");
        setDescription("");
        notify("画像を追加しました");
      } catch (error) {
        notify(errorText(error, "画像のアップロードに失敗"));
      } finally {
        setBusy(false);
      }
    },
    [accountId, label, description, kind, notify]
  );

  const remove = useCallback(
    async (assetId: string) => {
      try {
        await deleteImageAsset(assetId);
        setItems((prev) => prev.filter((item) => item.id !== assetId));
        notify("画像を削除しました");
      } catch (error) {
        notify(errorText(error, "画像の削除に失敗"));
      }
    },
    [notify]
  );

  return (
    <div className="stack gap-16">
    <div className="tile stack gap-8">
      <span className="label">AI画像生成（共通ルール）</span>
      <span className="muted small">
        ここに書いたルール（被写体・画風・色合い・背景など、毎回そろえたいこと）が、生成するすべての画像の先頭に付きます。投稿ごとに変わるのは「場面」だけです。下で「AI生成の見本」として登録した画像も毎回一緒に送られます。空欄にするとAI画像生成はオフです。
      </span>
      <textarea
        className="textarea"
        rows={4}
        aria-label="画像の共通ルール"
        placeholder="例: フラットなパステル調のイラスト。丸い輪郭、陰影は控えめ。主役は丸顔でオレンジの服の男の子。背景は透明。（キャラクターでなくても、写真風・抽象背景などの指定でOK）"
        value={stylePrompt}
        onChange={(e) => setStylePrompt(e.target.value)}
      />
      <button className="btn outline" type="button" disabled={stylePrompt === savedStyle} onClick={() => void saveStyle()}>
        共通ルールを保存
      </button>
    </div>
    <div className="tile stack gap-8">
      <span className="label">画像ライブラリ</span>
      <span className="muted small">
        「そのまま配置」はAIが内容に合うときだけ s1_image〜s8_image 欄に置きます。「AI生成の見本」はAI画像生成のたびに参考として送られます（最大4枚）。
      </span>
      {slots !== null && slots.length === 0 && usesImages ? (
        <span className="small" role="alert" style={{ color: "var(--danger, #e5484d)" }}>
          適用中のCanvaテンプレートに画像欄（s1_image〜s8_image）がありません。画像は使われず、テンプレートのデザインのままになります。画像を入れたい場合は、Canvaでテンプレートに画像欄を追加し、再公開してください。
        </span>
      ) : null}
      {slots !== null && slots.length === 0 && !usesImages ? (
        <span className="muted small">画像を使わない場合は、Canvaテンプレートのデザインがそのまま使われます。</span>
      ) : null}
      {slots !== null && slots.length > 0 ? (
        <span className="muted small">テンプレートの画像欄: {slots.join(", ")}</span>
      ) : null}
      <select
        className="select"
        aria-label="画像の種類"
        value={kind}
        onChange={(e) => setKind(e.target.value === "reference" ? "reference" : "asset")}
      >
        <option value="asset">そのまま配置（ロゴ・写真など）</option>
        <option value="reference">AI生成の見本（スタイル・被写体の参考）</option>
      </select>
      <input
        className="input"
        placeholder="ラベル（例: オフィス外観）"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <input
        className="input"
        placeholder="説明（どんなスライドに合うか）"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label className="btn outline" aria-disabled={busy}>
        <Icon name="upload" size={14} />
        画像をアップロード (PNG / JPEG / WebP, 5MB まで)
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
      <div className="stack gap-6">
        {items.length === 0 ? (
          <span className="muted small">画像はまだありません</span>
        ) : (
          items.map((item) => (
            <div className="queue-item" key={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageAssetFileUrl(item.id)}
                alt={item.label}
                width={40}
                height={40}
                style={{ objectFit: "cover", borderRadius: 4 }}
              />
              <span className="stack gap-4" style={{ flex: 1 }}>
                <strong style={{ fontSize: 12 }}>
                  {item.label}
                  {item.kind === "reference" ? "（見本）" : ""}
                </strong>
                <span className="muted small">{item.description.slice(0, 80)}</span>
              </span>
              <button
                type="button"
                className="btn ghost"
                aria-label="画像を削除"
                onClick={() => void remove(item.id)}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
    </div>
  );
}
