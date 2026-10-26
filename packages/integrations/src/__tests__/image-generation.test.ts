import { describe, expect, it, vi } from "vitest";
import { composeImagePrompt, generateSlideImage } from "../image-generation";

const PNG_B64 = btoa("png-bytes");
const ok = () => new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 });
const call = (fetchImpl: ReturnType<typeof vi.fn>) => fetchImpl.mock.calls[0] as unknown as [string, RequestInit];

describe("composeImagePrompt", () => {
  it("puts the fixed style first and the scene after it", () => {
    const prompt = composeImagePrompt("フラットなパステル調。背景は透明。", "夜のキッチンで冷蔵庫をのぞく");
    expect(prompt.indexOf("パステル")).toBeLessThan(prompt.indexOf("冷蔵庫"));
    expect(prompt).toContain("Scene:");
  });

  it("works without a style prompt", () => {
    expect(composeImagePrompt("", "scene A")).toContain("scene A");
  });
});

describe("generateSlideImage", () => {
  it("edits with every reference image and returns the decoded png", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const result = await generateSlideImage({
      apiKey: "k",
      prompt: "p",
      references: [
        { bytes: new Uint8Array([1]), contentType: "image/png", name: "a.png" },
        { bytes: new Uint8Array([2]), contentType: "image/jpeg", name: "b.jpg" }
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(new TextDecoder().decode(result.bytes)).toBe("png-bytes");
    expect(result.contentType).toBe("image/png");
    const [url, init] = call(fetchImpl);
    expect(url).toMatch(/\/images\/edits$/);
    const form = init.body as FormData;
    expect(form.getAll("image[]")).toHaveLength(2);
    expect(form.get("background")).toBe("auto");
    expect(String(form.get("prompt"))).toContain("p");
  });

  it("uses plain generation when there are no references", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await generateSlideImage({ apiKey: "k", prompt: "p", references: [], fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = call(fetchImpl);
    expect(url).toMatch(/\/images\/generations$/);
    expect(JSON.parse(String(init.body)).prompt).toBe("p");
  });

  it("retries transient failures then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(ok());
    const result = await generateSlideImage({
      apiKey: "k",
      prompt: "p",
      references: [],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => undefined
    });
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 }));
    await expect(
      generateSlideImage({ apiKey: "k", prompt: "p", references: [], fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow(/400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("requires an API key and fails when no image comes back", async () => {
    await expect(generateSlideImage({ prompt: "p", references: [] })).rejects.toThrow(/OpenAI/);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await expect(
      generateSlideImage({ apiKey: "k", prompt: "p", references: [], fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow(/no image/i);
  });
});
