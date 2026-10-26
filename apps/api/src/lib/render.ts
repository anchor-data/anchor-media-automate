import type { Repository } from "@ama/db";
import { resolveSlideImages, type CanvaClient } from "@ama/integrations";
import { slideFieldsSchema, slideImagesFrom } from "@ama/shared";
import type { Post } from "@ama/shared";
import { imageAssetKey } from "./image-assets";

export const EXPECTED_PAGE_COUNT = 8;

/** Canva autofill image fields (slot → Canva asset id) for the images chosen on a post. */
async function loadSlideImages(
  repo: Repository,
  canva: CanvaClient,
  post: Post,
  templateId: string,
  bucket: R2Bucket | undefined
): Promise<Record<string, string>> {
  const images = slideImagesFrom(post.slidesJson);
  if (images.length === 0) return {};
  if (!bucket) throw new Error("Post uses images but image storage (R2 IMAGE_ASSETS) is not configured");
  return resolveSlideImages({
    images,
    assets: await repo.listImageAssets(post.accountId),
    templateFields: await canva.getTemplateFieldNames(templateId),
    upload: async (asset) => {
      const object = await bucket.get(imageAssetKey(asset.id));
      if (!object) throw new Error(`Image file missing in storage: ${asset.label}`);
      const { assetId } = await canva.uploadAsset({
        name: asset.label,
        bytes: new Uint8Array(await object.arrayBuffer())
      });
      await repo.setImageAssetCanvaId(asset.id, assetId);
      return assetId;
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

/**
 * Render a post's slides through Canva and store one post_assets row per page.
 * `reexport` skips autofill and only re-exports the stored design (preview URLs expire,
 * the design id is the source of truth).
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
      const images = await loadSlideImages(repo, canva, post, account.canvaTemplateId, options.imageBucket);
      ({ designId } = await canva.autofill({
        templateId: account.canvaTemplateId,
        fields: slides.data,
        images,
        title: post.title
      }));
    }

    const urls = await canva.exportPages(designId);
    if (urls.length !== EXPECTED_PAGE_COUNT) {
      throw new Error(`Canva export returned ${urls.length} pages, expected ${EXPECTED_PAGE_COUNT}`);
    }
    await repo.replacePostAssets(
      post.id,
      urls.map((imageUrl, slideIndex) => ({
        imageUrl,
        slideIndex,
        canvaDesignId: designId,
        templateId: account.canvaTemplateId
      }))
    );
    await repo.updatePost(post.id, { generationStatus: "ready", generationError: null });
  } catch (error) {
    await repo.updatePost(post.id, { generationStatus: "failed", generationError: errorMessage(error) });
    throw error;
  }
}
