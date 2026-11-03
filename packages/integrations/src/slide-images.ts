import { IMAGE_ASSET_CONTENT_TYPES, IMAGE_ASSET_MAX_BYTES } from "@ama/shared";
import type { ImageAsset, SlideImage } from "@ama/shared";

/**
 * Turn a deck's image placements into Canva autofill image fields (slot → Canva asset id).
 * Only slots the brand template actually exposes are used, so a template without image fields
 * still renders text-only. Each asset is uploaded to Canva at most once (cached ids are reused).
 */
export async function resolveSlideImages(input: {
  images: readonly SlideImage[];
  assets: readonly ImageAsset[];
  templateFields: readonly string[];
  /** Uploads the asset to Canva and returns (and persists) its Canva asset id. */
  upload: (asset: ImageAsset) => Promise<string>;
}): Promise<Record<string, string>> {
  const fields = new Set(input.templateFields);
  const assets = new Map(input.assets.map((asset) => [asset.id, asset]));
  const canvaIds = new Map<string, string>();
  const resolved: Record<string, string> = {};

  for (const image of input.images) {
    const asset = assets.get(image.assetId);
    if (!asset || !fields.has(image.slot)) continue;
    let canvaId = asset.canvaAssetId ?? canvaIds.get(asset.id);
    if (!canvaId) {
      canvaId = await input.upload(asset);
      canvaIds.set(asset.id, canvaId);
    }
    resolved[image.slot] = canvaId;
  }
  return resolved;
}

export type ImageUploadCheck =
  | { ok: true; contentType: (typeof IMAGE_ASSET_CONTENT_TYPES)[number] }
  | { ok: false; error: string };

export function validateImageUpload(input: { contentType: string; size: number }): ImageUploadCheck {
  const contentType = IMAGE_ASSET_CONTENT_TYPES.find((type) => type === input.contentType);
  if (!contentType) return { ok: false, error: `Unsupported image type: use ${IMAGE_ASSET_CONTENT_TYPES.join(", ")}` };
  if (input.size <= 0) return { ok: false, error: "Image is empty" };
  if (input.size > IMAGE_ASSET_MAX_BYTES) return { ok: false, error: `Image too large (max ${IMAGE_ASSET_MAX_BYTES} bytes)` };
  return { ok: true, contentType };
}
