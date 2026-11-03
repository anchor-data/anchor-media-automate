import { readAsDataUrl } from "./read-file";

/** Longest side sent to the AI: plenty to read colors and layout, and keeps the request small. */
export const SCREENSHOT_MAX_SIDE = 1280;
export const MAX_SCREENSHOTS = 8;

/** Shrink a screenshot to at most SCREENSHOT_MAX_SIDE px and re-encode as JPEG. */
export async function toScreenshot(file: File): Promise<string> {
  const source = await readAsDataUrl(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = source;
  });
  const scale = Math.min(1, SCREENSHOT_MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}
