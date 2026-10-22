import type { Repository } from "@ama/db";
import type { CanvaClient } from "@ama/integrations";
import { slideFieldsSchema } from "@ama/shared";
import type { Post } from "@ama/shared";

export const EXPECTED_PAGE_COUNT = 8;

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
  options: { reexport?: boolean } = {}
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
      ({ designId } = await canva.autofill({
        templateId: account.canvaTemplateId,
        fields: slides.data,
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
