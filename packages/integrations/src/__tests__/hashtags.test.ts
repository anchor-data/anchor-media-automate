import { describe, expect, it } from "vitest";
import { captionWithHashtags } from "@ama/shared";

describe("captionWithHashtags", () => {
  it("appends the tags as a last paragraph", () => {
    expect(captionWithHashtags("保存してね！", ["#転職", "#面接準備"])).toBe("保存してね！\n\n#転職 #面接準備");
  });

  it("adds a missing # and skips tags already in the caption", () => {
    expect(captionWithHashtags("本文 #転職", ["転職", "面接準備"])).toBe("本文 #転職\n\n#面接準備");
  });

  it("returns the caption unchanged when there is nothing to add", () => {
    expect(captionWithHashtags("本文", [])).toBe("本文");
    expect(captionWithHashtags("本文 #a #b", ["#a", "#b"])).toBe("本文 #a #b");
  });

  it("de-duplicates and trims", () => {
    expect(captionWithHashtags("  本文  ", ["#a", "#a", "  "])).toBe("本文\n\n#a");
  });

  it("works for an empty caption", () => {
    expect(captionWithHashtags("", ["#a"])).toBe("#a");
  });
});
