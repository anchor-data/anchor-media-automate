/**
 * Dominant colors of an image, measured from its pixels. A vision model only eyeballs colors, so the
 * measured values are handed to it as facts ("this panel is #1d4a43, 62% of the image").
 */

export interface PaletteColor {
  hex: string;
  /** Share of the image's pixels, 0-1. */
  share: number;
}

const hex2 = (value: number): string => Math.round(value).toString(16).padStart(2, "0");
const toHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const distance = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** Colors closer than this (RGB distance) count as the same color. */
const MERGE_DISTANCE = 48;
/** Colors covering less than this share of the image are ignored. */
const MIN_SHARE = 0.02;

/**
 * `data` is RGBA pixels (canvas ImageData order). Pixels are grouped into 4-bit-per-channel buckets,
 * the biggest buckets are taken one by one, and a bucket close to one already taken joins it.
 */
export function paletteFromPixels(data: ArrayLike<number>, count = 6): PaletteColor[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1;
    buckets.set(key, bucket);
    total += 1;
  }
  if (total === 0) return [];

  const picked: Array<{ rgb: [number, number, number]; n: number }> = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const rgb: [number, number, number] = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
    const near = picked.find((entry) => distance(entry.rgb, rgb) < MERGE_DISTANCE);
    if (near) near.n += bucket.n;
    else if (picked.length < count * 3) picked.push({ rgb, n: bucket.n });
  }
  return picked
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((entry) => ({ hex: toHex(...entry.rgb), share: entry.n / total }))
    .filter((color) => color.share >= MIN_SHARE);
}

/** "#1d4a43 62%, #f3e8c4 14%": the compact form stored with a reference and shown to the model. */
export function formatPalette(colors: readonly PaletteColor[]): string {
  return colors.map((color) => `${color.hex} ${Math.round(color.share * 100)}%`).join(", ");
}
