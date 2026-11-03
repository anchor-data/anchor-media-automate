import type { SlideDeck, SlideImage } from "@ama/shared";

/**
 * Keep a regenerated deck's page `page` (1-based) and everything else from the previous deck:
 * the other pages' text, their images and the caption stay as they were.
 */
export function mergeSinglePage(previous: SlideDeck, regenerated: SlideDeck, page: number): SlideDeck {
  const prefix = `s${page}_`;
  const slot = `s${page}_image`;
  const slides = { ...previous.slides };
  for (const [key, value] of Object.entries(regenerated.slides)) {
    if (key.startsWith(prefix)) slides[key] = value;
  }
  return {
    ...previous,
    slides,
    images: (regenerated.images ?? []).filter((image) => image.slot === slot),
    imagePrompts: (regenerated.imagePrompts ?? []).filter((prompt) => prompt.slot === slot)
  };
}

/** The previous images of the other pages, plus the page's new image (if it got one). */
export function keepOtherImages(previous: readonly SlideImage[], generated: readonly SlideImage[], page: number): SlideImage[] {
  const slot = `s${page}_image`;
  const newForPage = generated.filter((image) => image.slot === slot);
  const others = previous.filter((image) => image.slot !== slot);
  return [...others, ...(newForPage.length > 0 ? newForPage : previous.filter((image) => image.slot === slot))];
}
