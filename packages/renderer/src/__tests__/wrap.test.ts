import { describe, expect, it } from "vitest";
import { textUnits, wrapJapanese } from "../wrap";

describe("textUnits", () => {
  it("counts full-width characters as 1 and ASCII as about half", () => {
    expect(textUnits("あいう")).toBe(3);
    expect(textUnits("abcd")).toBeCloseTo(2.2, 5);
    expect(textUnits("")).toBe(0);
  });
});

describe("wrapJapanese", () => {
  const text = "大規模でもサーバー側で事前生成。画面切替がとにかく早い！";

  it("returns short text unchanged", () => {
    expect(wrapJapanese("短い文", 10)).toBe("短い文");
    expect(wrapJapanese("", 10)).toBe("");
  });

  it("keeps every character, only inserting line breaks", () => {
    expect(wrapJapanese(text, 14).replace(/\n/g, "")).toBe(text);
  });

  it("keeps each line within the width (plus one unit of kinsoku slack)", () => {
    for (const width of [10, 14, 19]) {
      for (const line of wrapJapanese(text, width).split("\n")) {
        expect(textUnits(line)).toBeLessThanOrEqual(width + 1);
      }
    }
  });

  it("never starts a line with closing punctuation", () => {
    for (const width of [8, 9, 10, 11, 12, 13, 14]) {
      for (const line of wrapJapanese(text, width).split("\n")) {
        expect(line).not.toMatch(/^[。、，．！？）」』】〉》ー]/);
      }
    }
  });

  it("breaks between words instead of inside them", () => {
    const wrapped = wrapJapanese("画面切替がとにかく早い", 6).split("\n");
    // "とにかく" and "画面" are words: none of them may be split across lines
    const joined = wrapped.join("|");
    expect(joined).not.toMatch(/と\|にかく|とに\|かく|とにか\|く/);
    expect(joined).not.toMatch(/画\|面/);
  });

  it("respects existing line breaks", () => {
    const lines = wrapJapanese("一行目\n二行目", 20).split("\n");
    expect(lines).toEqual(["一行目", "二行目"]);
  });

  it("wraps mixed latin text by weighted width", () => {
    const lines = wrapJapanese("RSC 活用アイデア3選まとめ", 7).split("\n");
    for (const line of lines) expect(textUnits(line)).toBeLessThanOrEqual(8);
    expect(lines.join("")).toBe("RSC 活用アイデア3選まとめ");
  });
});
