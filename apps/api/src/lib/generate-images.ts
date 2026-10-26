import type { Repository } from "@ama/db";
import {
  composeImagePrompt,
  generateSlideImage,
  logOpenAiImageBatchCost,
  type ReferenceImage
} from "@ama/integrations";
import type { ImageAsset, SlideDeck, SlideImage } from "@ama/shared";
import { imageAssetKey } from "./image-assets";

const MAX_REFERENCE_IMAGES = 4;

export type DeckImageResult = { images: SlideImage[]; warnings: string[] };

async function loadReferences(repo: Repository, bucket: R2Bucket, accountId: string): Promise<ReferenceImage[]> {
  const references = (await repo.listImageAssets(accountId, ["reference"])).slice(0, MAX_REFERENCE_IMAGES);
  const loaded = await Promise.all(
    references.map(async (asset): Promise<ReferenceImage | null> => {
      const object = await bucket.get(imageAssetKey(asset.id));
      if (!object) return null;
      return { bytes: new Uint8Array(await object.arrayBuffer()), contentType: asset.contentType, name: `${asset.id}.png` };
    })
  );
  return loaded.filter((ref): ref is ReferenceImage => ref !== null);
}

/**
 * Turn the agent's scene prompts into stored images. A failed slide is skipped with a warning
 * instead of failing the whole post; the slide just renders without an illustration.
 */
export async function generateDeckImages(
  repo: Repository,
  deps: { openAiApiKey?: string; bucket?: R2Bucket },
  accountId: string,
  deck: SlideDeck
): Promise<DeckImageResult> {
  const placed = deck.images ?? [];
  const prompts = deck.imagePrompts ?? [];
  if (prompts.length === 0) return { images: [...placed], warnings: [] };
  if (!deps.bucket) {
    return { images: [...placed], warnings: ["Image generation skipped: image storage (R2 IMAGE_ASSETS) is not configured"] };
  }
  const bucket = deps.bucket;

  const account = await repo.getAccount(accountId);
  const style = account?.imageStylePrompt ?? "";
  const references = await loadReferences(repo, bucket, accountId);

  const costs: Array<number | null> = [];
  const settled = await Promise.allSettled(
    prompts.map(async (prompt): Promise<SlideImage> => {
      const generated = await generateSlideImage({
        apiKey: deps.openAiApiKey,
        prompt: composeImagePrompt(style, prompt.scene),
        references,
        label: `image ${prompt.slot}`
      });
      costs.push(generated.costUsd);
      const asset = await repo.createImageAsset(accountId, {
        label: `generated ${prompt.slot}`,
        description: prompt.scene.slice(0, 500),
        contentType: generated.contentType,
        kind: "generated",
        sizeBytes: generated.bytes.byteLength
      });
      try {
        await bucket.put(imageAssetKey(asset.id), generated.bytes, {
          httpMetadata: { contentType: generated.contentType }
        });
      } catch (error) {
        await repo.deleteImageAsset(asset.id);
        throw error;
      }
      return { slot: prompt.slot, assetId: asset.id };
    })
  );

  logOpenAiImageBatchCost(`images account=${accountId}`, costs);

  const images = [...placed];
  const warnings: string[] = [];
  settled.forEach((result, index) => {
    const slot = prompts[index]!.slot;
    if (result.status === "fulfilled") images.push(result.value);
    else warnings.push(`Image for ${slot} failed: ${result.reason instanceof Error ? result.reason.message : "unknown error"}`);
  });
  return { images, warnings };
}

/** Delete the generated images of a previous deck once a new one replaced them. */
export async function discardGeneratedImages(
  repo: Repository,
  bucket: R2Bucket | undefined,
  previous: readonly SlideImage[]
): Promise<void> {
  for (const image of previous) {
    const asset: ImageAsset | null = await repo.getImageAsset(image.assetId);
    if (asset?.kind !== "generated") continue;
    await repo.deleteImageAsset(asset.id);
    await bucket?.delete(imageAssetKey(asset.id));
  }
}
