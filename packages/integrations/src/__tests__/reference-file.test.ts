import { describe, expect, it } from "vitest";
import {
  REFERENCE_FILE_MAX_BYTES,
  REFERENCE_TEXT_MAX_CHARS,
  ReferenceFileError,
  parseReferenceFile
} from "../reference-file";

const encode = (text: string) => new TextEncoder().encode(text);

describe("parseReferenceFile", () => {
  it("reads a .txt file and derives the title from the file name", () => {
    const parsed = parseReferenceFile({ name: "面接ノウハウ.txt", bytes: encode("line1\r\nline2") });
    expect(parsed).toEqual({ title: "面接ノウハウ", text: "line1\nline2", truncated: false });
  });

  it("accepts markdown and an explicit title", () => {
    const parsed = parseReferenceFile({ name: "notes.MD", bytes: encode("# hi"), title: "My notes" });
    expect(parsed.title).toBe("My notes");
    expect(parsed.text).toBe("# hi");
  });

  it("strips a UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode("hello")]);
    expect(parseReferenceFile({ name: "a.txt", bytes }).text).toBe("hello");
  });

  it("truncates text longer than the limit", () => {
    const parsed = parseReferenceFile({
      name: "long.txt",
      bytes: encode("a".repeat(REFERENCE_TEXT_MAX_CHARS + 10))
    });
    expect(parsed.truncated).toBe(true);
    expect(parsed.text).toHaveLength(REFERENCE_TEXT_MAX_CHARS);
  });

  it.each(["photo.png", "cv.pdf", "noextension"])("rejects unsupported file %s", (name) => {
    expect(() => parseReferenceFile({ name, bytes: encode("x") })).toThrow(ReferenceFileError);
  });

  it("rejects files over the byte limit", () => {
    const bytes = new Uint8Array(REFERENCE_FILE_MAX_BYTES + 1);
    expect(() => parseReferenceFile({ name: "big.txt", bytes })).toThrow(/too large/);
  });

  it("rejects empty or binary content", () => {
    expect(() => parseReferenceFile({ name: "e.txt", bytes: encode("  \n ") })).toThrow(/empty/);
    expect(() => parseReferenceFile({ name: "b.txt", bytes: new Uint8Array([0x61, 0x00, 0x62]) })).toThrow(
      /not valid text/
    );
  });
});
