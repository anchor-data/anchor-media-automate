import { describe, expect, it, vi } from "vitest";
import { extractReferencePatterns } from "../reference-extract";

const IMAGE = "data:image/png;base64,AAAA";
const completion = (content: unknown, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status });

const MODEL_OUTPUT = {
  hooks: [
    { title: "手順系フック", text: "辞めたいと思ったら、在職中にやる順番" },
    { title: "チェックリスト系フック", text: "求人票で見落としがちな3つのポイント" }
  ],
  slidePattern: { title: "解説カルーセル", text: "1枚目で悩み → 2枚目で共感 → 3〜6で手順 → 8でCTA" },
  voice: { title: "トーン見本", text: "断定しすぎず、「まずはこれだけ」と絞る。" }
};

describe("extractReferencePatterns", () => {
  it("turns the model output into hook / slide / voice references", async () => {
    const fetchImpl = vi.fn(async () => completion(MODEL_OUTPUT));
    const refs = await extractReferencePatterns({
      handle: "@wakaru",
      screenshots: [IMAGE],
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    expect(refs.map((r) => r.kind)).toEqual(["hook_pattern", "hook_pattern", "slide_pattern", "voice_sample"]);
    expect(refs[0]).toMatchObject({ title: "手順系フック", examplesText: "辞めたいと思ったら、在職中にやる順番" });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(JSON.stringify(body.messages)).toContain(IMAGE);
  });

  it("requires an API key and at least one screenshot", async () => {
    await expect(extractReferencePatterns({ handle: "@a", screenshots: [IMAGE] })).rejects.toThrow(/OpenAI/);
    await expect(extractReferencePatterns({ handle: "@a", screenshots: [], apiKey: "k" })).rejects.toThrow(/screenshot/i);
  });

  it("surfaces an OpenAI error", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(
      extractReferencePatterns({ handle: "@a", screenshots: [IMAGE], apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow(/500/);
  });

  it("rejects output that does not match the schema", async () => {
    const fetchImpl = vi.fn(async () => completion({ hooks: "x" }));
    await expect(
      extractReferencePatterns({ handle: "@a", screenshots: [IMAGE], apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow();
  });
});
