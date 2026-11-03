import { describe, expect, it } from "vitest";
import { parseInstagramHandle } from "../instagram";

describe("parseInstagramHandle", () => {
  it("reads the handle from a profile url, with or without query", () => {
    expect(parseInstagramHandle("https://www.instagram.com/wakaru_tensyoku?stkn=abc")).toBe("wakaru_tensyoku");
    expect(parseInstagramHandle("instagram.com/wakaru_tensyoku/")).toBe("wakaru_tensyoku");
  });

  it("accepts a bare @handle", () => {
    expect(parseInstagramHandle("@wakaru_tensyoku")).toBe("wakaru_tensyoku");
  });

  it("rejects non-instagram hosts and post urls", () => {
    expect(parseInstagramHandle("https://example.com/wakaru")).toBeNull();
    expect(parseInstagramHandle("https://www.instagram.com/p/ABC123/")).toBeNull();
    expect(parseInstagramHandle("")).toBeNull();
  });
});
