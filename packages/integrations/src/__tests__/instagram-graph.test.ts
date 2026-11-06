import { describe, expect, it } from "vitest";
import {
  connectInstagramToken,
  publishInstagramCarousel,
  refreshInstagramToken
} from "../instagram-graph";

const NOW = new Date("2026-11-03T00:00:00.000Z");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Call = { url: string; method: string; params: Record<string, string> };

/** Fake Graph API: answers by path and records every call. */
function fakeGraph(handlers: Array<[RegExp, (call: Call) => Response]>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const params: Record<string, string> = Object.fromEntries(url.searchParams);
    if (init?.body instanceof URLSearchParams) Object.assign(params, Object.fromEntries(init.body));
    const call = { url: url.pathname, method: init?.method ?? "GET", params };
    calls.push(call);
    const handler = handlers.find(([pattern]) => pattern.test(`${call.method} ${call.url}`));
    return handler ? handler[1](call) : json({ error: { message: `unexpected ${call.method} ${call.url}` } }, 500);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("connectInstagramToken", () => {
  it("reads the profile for the pasted token", async () => {
    const { calls, fetchImpl } = fakeGraph([[/GET \/v23\.0\/me/, () => json({ user_id: "178", username: "wakaru" })]]);
    const grant = await connectInstagramToken("  tok  ", fetchImpl, NOW);
    expect(grant).toEqual({
      accessToken: "tok",
      igUserId: "178",
      username: "wakaru",
      expiresAt: new Date(NOW.getTime() + 60 * 24 * 3600 * 1000).toISOString()
    });
    expect(calls[0]?.params.access_token).toBe("tok");
  });

  it("surfaces Instagram's error message", async () => {
    const { fetchImpl } = fakeGraph([[/GET/, () => json({ error: { message: "Invalid OAuth access token" } }, 400)]]);
    await expect(connectInstagramToken("bad", fetchImpl, NOW)).rejects.toThrow(/Invalid OAuth/);
  });

  it("rejects an empty token without calling the API", async () => {
    const { calls, fetchImpl } = fakeGraph([]);
    await expect(connectInstagramToken("  ", fetchImpl, NOW)).rejects.toThrow(/required/);
    expect(calls).toHaveLength(0);
  });
});

describe("refreshInstagramToken", () => {
  it("returns the new token and expiry", async () => {
    const { fetchImpl } = fakeGraph([[/GET \/refresh_access_token/, () => json({ access_token: "new", expires_in: 100 })]]);
    expect(await refreshInstagramToken("old", fetchImpl, NOW)).toEqual({
      accessToken: "new",
      expiresAt: new Date(NOW.getTime() + 100_000).toISOString()
    });
  });
});

describe("publishInstagramCarousel", () => {
  const base = { igUserId: "178", accessToken: "tok", caption: "hello", sleep: async () => {} };

  it("creates children, a carousel, publishes and returns the permalink", async () => {
    let child = 0;
    const { calls, fetchImpl } = fakeGraph([
      [
        /POST \/v23\.0\/178\/media$/,
        (call) => json({ id: call.params.media_type === "CAROUSEL" ? "carousel" : `child${++child}` })
      ],
      [/GET \/v23\.0\/(child\d|carousel)$/, () => json({ status_code: "FINISHED" })],
      [/POST \/v23\.0\/178\/media_publish/, () => json({ id: "media9" })],
      [/GET \/v23\.0\/media9/, () => json({ permalink: "https://instagram.com/p/abc" })]
    ]);
    const result = await publishInstagramCarousel({ ...base, imageUrls: ["https://a/1.jpg", "https://a/2.jpg"], fetchImpl });
    expect(result).toEqual({ mediaId: "media9", permalink: "https://instagram.com/p/abc" });
    const carouselCall = calls.find((c) => c.params.media_type === "CAROUSEL");
    expect(carouselCall?.params.children).toBe("child1,child2");
    expect(carouselCall?.params.caption).toBe("hello");
    expect(calls.find((c) => c.url.endsWith("media_publish"))?.params.creation_id).toBe("carousel");
  });

  it("rejects image counts Instagram does not accept without calling the API", async () => {
    const { calls, fetchImpl } = fakeGraph([]);
    await expect(publishInstagramCarousel({ ...base, imageUrls: ["https://a/1.jpg"], fetchImpl })).rejects.toThrow(/2-10/);
    expect(calls).toHaveLength(0);
  });

  it("fails when Instagram reports a processing error", async () => {
    const { fetchImpl } = fakeGraph([
      [/POST \/v23\.0\/178\/media$/, () => json({ id: "child" })],
      [/GET \/v23\.0\/child$/, () => json({ status_code: "ERROR" })]
    ]);
    await expect(
      publishInstagramCarousel({ ...base, imageUrls: ["https://a/1.jpg", "https://a/2.jpg"], fetchImpl })
    ).rejects.toThrow(/could not process/);
  });
});
