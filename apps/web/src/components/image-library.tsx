"use client";

import { useCallback, useEffect, useState } from "react";
import type { ImageAsset } from "@ama/shared";
import { deleteImageAsset, imageAssetFileUrl, listImageAssets, uploadImageAsset } from "../lib/api";
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

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const { item } = await uploadImageAsset(accountId, file, label.trim(), description.trim());
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
    [accountId, label, description, notify]
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
    <div className="tile stack gap-8">
      <span className="label">画像ライブラリ（スライドに配置）</span>
      <span className="muted small">
        AIが内容に合う画像を選び、Canvaテンプレートの s1_image〜s8_image 欄に配置します。ラベルと説明で用途を伝えてください。
      </span>
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
                <strong style={{ fontSize: 12 }}>{item.label}</strong>
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
  );
}
