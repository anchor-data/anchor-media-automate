import { describe, expect, it, vi } from "vitest";
import type { ImageAsset } from "@ama/shared";
import { IMAGE_ASSET_MAX_BYTES } from "@ama/shared";
import { resolveSlideImages, validateImageUpload } from "../slide-images";

const asset = (id: string, canvaAssetId: string | null = null): ImageAsset => ({
  id,
  accountId: "acc",
  label: id,
  description: "",
  contentType: "image/png",
  sizeBytes: 1,
  canvaAssetId,
  createdAt: "2026-01-01"
});

describe("resolveSlideImages", () => {
  it("maps slots to Canva asset ids, uploading only assets without one", async () => {
    const upload = vi.fn(async (a: ImageAsset) => `canva_${a.id}`);
    const result = await resolveSlideImages({
      images: [
        { slot: "s1_image", assetId: "a" },
        { slot: "s2_image", assetId: "b" }
      ],
      assets: [asset("a", "cached_a"), asset("b")],
      templateFields: ["s1_image", "s2_image", "s1_title"],
      upload
    });
    expect(result).toEqual({ s1_image: "cached_a", s2_image: "canva_b" });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("uploads an asset used in two slots once", async () => {
    const upload = vi.fn(async () => "canva_a");
    const result = await resolveSlideImages({
      images: [
        { slot: "s1_image", assetId: "a" },
        { slot: "s3_image", assetId: "a" }
      ],
      assets: [asset("a")],
      templateFields: ["s1_image", "s3_image"],
      upload
    });
    expect(result).toEqual({ s1_image: "canva_a", s3_image: "canva_a" });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("skips slots the template does not expose and assets that no longer exist", async () => {
    const upload = vi.fn(async () => "x");
    const result = await resolveSlideImages({
      images: [
        { slot: "s1_image", assetId: "a" },
        { slot: "s2_image", assetId: "gone" }
      ],
      assets: [asset("a")],
      templateFields: ["s2_image"],
      upload
    });
    expect(result).toEqual({});
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("validateImageUpload", () => {
  it("accepts png/jpeg/webp within the size limit", () => {
    expect(validateImageUpload({ contentType: "image/jpeg", size: 100 })).toEqual({ ok: true, contentType: "image/jpeg" });
  });
  it("rejects other types, empty and oversize files", () => {
    expect(validateImageUpload({ contentType: "image/gif", size: 100 }).ok).toBe(false);
    expect(validateImageUpload({ contentType: "image/png", size: 0 }).ok).toBe(false);
    expect(validateImageUpload({ contentType: "image/png", size: IMAGE_ASSET_MAX_BYTES + 1 }).ok).toBe(false);
  });
});
