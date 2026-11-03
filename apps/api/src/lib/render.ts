import type { Repository } from "@ama/db";
import { bytesToDataUrl, type CanvaClient } from "@ama/integrations";
import { PPTX_MIME, renderDeckPptx, resolvePostDesign } from "@ama/renderer";
import { deckExtrasFrom, slideFieldsSchema, slidesJsonWith } from "@ama/shared";
import type { Post, SlideImage } from "@ama/shared";
import { imageAssetKey } from "./image-assets";

export const EXPECTED_PAGE_COUNT = 8;

/**
 * Image bytes for the images chosen on a post, as data URLs by slot. An image whose file is gone from
 * storage is skipped: the page then simply renders its no-image layout.
 */
async function loadImageData(
  repo: Repository,
  bucket: R2Bucket | undefined,
  images: readonly SlideImage[]
): Promise<Record<string, string>> {
  if (!bucket) return {};
  const loaded = await Promise.all(
    images.map(async (image): Promise<[string, string] | null> => {
      const asset = await repo.getImageAsset(image.assetId);
      const object = asset ? await bucket.get(imageAssetKey(asset.id)) : null;
      if (!asset || !object) return null;
      return [image.slot, bytesToDataUrl(new Uint8Array(await object.arrayBuffer()), asset.contentType)];
    })
  );
  return Object.fromEntries(loaded.filter((entry): entry is [string, string] => entry !== null));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

/**
 * Render a post's slides: the post's design + copy become a PPTX, Canva imports it as an editable
 * design, and Canva's PNG export of each page is stored as the preview (one post_assets row per page).
 *
 * `reexport` skips the import and only re-exports the stored design, so edits a human made in Canva
 * show up here (preview URLs also expire; the design id is the source of truth).
 */
export async function renderPost(
  repo: Repository,
  canva: CanvaClient,
  post: Post,
  options: { reexport?: boolean; imageBucket?: R2Bucket } = {}
): Promise<void> {
  try {
    await repo.updatePost(post.id, { generationStatus: "rendering", generationError: null });

    const existing = (await repo.getPost(post.id))?.assets ?? [];
    const storedDesignId = existing.find((asset) => asset.canvaDesignId)?.canvaDesignId;
    const account = await repo.getAccount(post.accountId);
    if (!account) throw new Error(`Account not found: ${post.accountId}`);

    let designId = storedDesignId;
    if (!options.reexport || !designId) {
      const slides = slideFieldsSchema.safeParse(post.slidesJson);
      if (!slides.success) throw new Error("Post has no valid slides to render");
      const extras = deckExtrasFrom(post.slidesJson);
      // Chosen once and stored, so later renders and text edits keep the same look.
      const design = resolvePostDesign(account.design?.spec, extras.design, post.id);
      if (!extras.design) {
        await repo.updatePost(post.id, { slidesJson: slidesJsonWith(slides.data, { ...extras, design }) });
      }
      const images = await loadImageData(repo, options.imageBucket, extras.images);
      const pptx = await renderDeckPptx({ spec: design, fields: slides.data, handle: account.instagramHandle, images });
      ({ designId } = await canva.importFile({ title: post.title, bytes: pptx, mimeType: PPTX_MIME }));
    }

    const urls = await canva.exportPages(designId);
    if (urls.length !== EXPECTED_PAGE_COUNT) {
      throw new Error(`Canva export returned ${urls.length} pages, expected ${EXPECTED_PAGE_COUNT}`);
    }
    await repo.replacePostAssets(
      post.id,
      urls.map((imageUrl, slideIndex) => ({ imageUrl, slideIndex, canvaDesignId: designId }))
    );
    await repo.updatePost(post.id, { generationStatus: "ready", generationError: null });
  } catch (error) {
    await repo.updatePost(post.id, { generationStatus: "failed", generationError: errorMessage(error) });
    throw error;
  }
}
