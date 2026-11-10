import { describe, expect, it } from "vitest";
import { formatPalette, paletteFromPixels } from "../palette";

const fill = (colors: Array<[number, number, number, number]>): number[] => colors.flatMap(([r, g, b, count]) => Array.from({ length: count }, () => [r, g, b, 255]).flat());

describe("paletteFromPixels", () => {
  it("returns the dominant colors with their share, biggest first", () => {
    const palette = paletteFromPixels(fill([[29, 74, 67, 600], [243, 232, 196, 300], [250, 200, 40, 100]]));
    expect(palette.map((color) => color.hex)).toEqual(["#1d4a43", "#f3e8c4", "#fac828"]);
    expect(palette[0]!.share).toBeCloseTo(0.6, 5);
  });

  it("merges near-identical shades into one color", () => {
    const palette = paletteFromPixels(fill([[30, 74, 67, 300], [34, 78, 70, 300], [240, 240, 240, 400]]));
    expect(palette).toHaveLength(2);
    expect(palette[0]!.share).toBeCloseTo(0.6, 5);
  });

  it("ignores transparent pixels and tiny specks", () => {
    const transparent = Array.from({ length: 100 }, () => [255, 0, 0, 0]).flat();
    const palette = paletteFromPixels([...transparent, ...fill([[10, 10, 10, 990], [200, 0, 0, 10]])]);
    expect(palette.map((color) => color.hex)).toEqual(["#0a0a0a"]);
  });

  it("is empty for an empty image", () => {
    expect(paletteFromPixels([])).toEqual([]);
  });
});

describe("formatPalette", () => {
  it("lists hex and percent", () => {
    expect(formatPalette([{ hex: "#1d4a43", share: 0.62 }, { hex: "#f3e8c4", share: 0.141 }])).toBe("#1d4a43 62%, #f3e8c4 14%");
  });
});
