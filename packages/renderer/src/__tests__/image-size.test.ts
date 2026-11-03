import { describe, expect, it } from "vitest";
import { fitContain, readImageSize } from "../image-size";

const b64 = (bytes: number[]) => `data:image/x;base64,${btoa(String.fromCharCode(...bytes))}`;
const be16 = (n: number) => [n >> 8, n & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];

describe("readImageSize", () => {
  it("reads a PNG", () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    expect(readImageSize(png)).toEqual({ w: 1, h: 1 });
    const wide = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 132, 0, 0, 2, 88]);
    expect(readImageSize(wide)).toEqual({ w: 900, h: 600 });
  });

  it("reads a JPEG after skipping other segments", () => {
    const jpeg = b64([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 8, ...be16(480), ...be16(640), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    expect(readImageSize(jpeg)).toEqual({ w: 640, h: 480 });
  });

  it("reads a lossy-extended WebP", () => {
    const webp = b64([...[..."RIFF"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...[..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(799), ...le24(399)]);
    expect(readImageSize(webp)).toEqual({ w: 800, h: 400 });
  });

  it("returns null for unknown or broken data", () => {
    expect(readImageSize("data:image/png;base64,AAAA")).toBeNull();
    expect(readImageSize("not a data url")).toBeNull();
  });
});

describe("fitContain", () => {
  const box = { x: 100, y: 200, w: 800, h: 400 };

  it("shows the whole image, centered, keeping its aspect ratio", () => {
    expect(fitContain({ w: 100, h: 100 }, box)).toEqual({ x: 300, y: 200, w: 400, h: 400 });
    expect(fitContain({ w: 400, h: 100 }, box)).toEqual({ x: 100, y: 300, w: 800, h: 200 });
  });

  it("never exceeds the box and fills one dimension", () => {
    const fitted = fitContain({ w: 123, h: 457 }, box);
    expect(fitted.w).toBeLessThanOrEqual(box.w);
    expect(fitted.h).toBeLessThanOrEqual(box.h);
    expect(Math.round(fitted.h)).toBe(box.h);
  });

  it("falls back to the box when the size is unknown", () => {
    expect(fitContain(null, box)).toEqual(box);
  });
});
