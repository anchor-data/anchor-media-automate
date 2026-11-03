import type { Box } from "./layout";

export interface Size { w: number; h: number }

function decode(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

const be32 = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const le24 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const ascii = (b: Uint8Array, start: number, length: number) => String.fromCharCode(...b.subarray(start, start + length));

function png(b: Uint8Array): Size | null {
  return b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" ? { w: be32(b, 16), h: be32(b, 20) } : null;
}

function jpeg(b: Uint8Array): Size | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    // SOF0-SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: be16(b, i + 5), w: be16(b, i + 7) };
    }
    i += 2 + be16(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): Size | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const kind = ascii(b, 12, 4);
  if (kind === "VP8X") return { w: le24(b, 24) + 1, h: le24(b, 27) + 1 };
  if (kind === "VP8 ") return { w: (b[26]! | (b[27]! << 8)) & 0x3fff, h: (b[28]! | (b[29]! << 8)) & 0x3fff };
  if (kind === "VP8L") {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Pixel size of a PNG/JPEG/WebP data URL; null when the format or data is not recognized. */
export function readImageSize(dataUrl: string): Size | null {
  const bytes = decode(dataUrl);
  if (!bytes) return null;
  const size = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  return size && size.w > 0 && size.h > 0 ? size : null;
}

/** The largest box with the image's aspect ratio that fits inside `box`, centered in it. */
export function fitContain(natural: Size | null, box: Box): Box {
  if (!natural) return box;
  const scale = Math.min(box.w / natural.w, box.h / natural.h);
  const w = natural.w * scale;
  const h = natural.h * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
