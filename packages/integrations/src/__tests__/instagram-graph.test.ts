import { describe, expect, it } from "vitest";
import {
  connectInstagramToken,
  detectProvider,
  publishInstagramCarousel,
  refreshInstagramToken
} from "../instagram-graph";

const NOW = new Date("2026-11-03T00:00:00.000Z");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Call = { host: string; url: string; method: string; params: Record<string, string> };

/** Fake Graph API: answers by path and records every call. */
function fakeGraph(handlers: Array<[RegExp, (call: Call) => Response]>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const params: Record<string, string> = Object.fromEntries(url.searchParams);
    if (init?.body instanceof URLSearchParams) Object.assign(params, Object.fromEntries(init.body));
    const call = { host: url.host, url: url.pathname, method: init?.method ?? "GET", params };
    calls.push(call);
    const handler = handlers.find(([pattern]) => pattern.test(`${call.method} ${call.url}`));
    return handler ? handler[1](call) : json({ error: { message: `unexpected ${call.method} ${call.url}` } }, 500);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("connectInstagramToken", () => {
  it("reads the profile for the pasted token", async () => {
    const { calls, fetchImpl } = fakeGraph([[/GET \/v23\.0\/me/, () => json({ user_id: "178", username: "wakaru" })]]);
    const grant = await connectInstagramToken("  tok  ", {}, fetchImpl, NOW);
    expect(grant).toEqual({
      accessToken: "tok",
      igUserId: "178",
      username: "wakaru",
      provider: "instagram_login",
      expiresAt: new Date(NOW.getTime() + 60 * 24 * 3600 * 1000).toISOString()
    });
    expect(calls[0]?.params.access_token).toBe("tok");
  });

  it("surfaces Instagram's error message", async () => {
    const { fetchImpl } = fakeGraph([[/GET/, () => json({ error: { message: "Invalid OAuth access token" } }, 400)]]);
    await expect(connectInstagramToken("bad", {}, fetchImpl, NOW)).rejects.toThrow(/Invalid OAuth/);
  });

  it("rejects an empty token without calling the API", async () => {
    const { calls, fetchImpl } = fakeGraph([]);
    await expect(connectInstagramToken("  ", {}, fetchImpl, NOW)).rejects.toThrow(/required/);
    expect(calls).toHaveLength(0);
  });
});

describe("detectProvider", () => {
  it("maps token prefixes to providers", () => {
    expect(detectProvider("EAAabc")).toBe("facebook_login");
    expect(detectProvider("IGAAabc")).toBe("instagram_login");
  });
});

describe("connectInstagramToken (facebook_login)", () => {
  const profile = [/GET \/v26\.0\/178$/, () => json({ id: "178", username: "ac_test" })] as [RegExp, () => Response];

  it("uses the single assigned account and never expires", async () => {
    const { calls, fetchImpl } = fakeGraph([
      [/GET \/v26\.0\/me\/assigned_instagram_accounts/, () => json({ data: [{ id: "178" }] })],
      profile
    ]);
    const grant = await connectInstagramToken("EAAtok", {}, fetchImpl, NOW);
    expect(grant).toEqual({ accessToken: "EAAtok", igUserId: "178", username: "ac_test", provider: "facebook_login", expiresAt: null });
    expect(calls.every((c) => c.host === "graph.facebook.com" && c.url.startsWith("/v26.0/"))).toBe(true);
  });

  it("skips the assigned-accounts lookup when igUserId is given", async () => {
    const { calls, fetchImpl } = fakeGraph([profile]);
    await connectInstagramToken("EAAtok", { igUserId: "178" }, fetchImpl, NOW);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/v26.0/178");
  });

  it("errors on zero or multiple assigned accounts", async () => {
    const none = fakeGraph([[/assigned_instagram_accounts/, () => json({ data: [] })]]);
    await expect(connectInstagramToken("EAAtok", {}, none.fetchImpl, NOW)).rejects.toThrow(/IG ユーザー ID/);
    const many = fakeGraph([[/assigned_instagram_accounts/, () => json({ data: [{ id: "1" }, { id: "2" }] })]]);
    await expect(connectInstagramToken("EAAtok", {}, many.fetchImpl, NOW)).rejects.toThrow(/複数/);
  });
});

describe("Graph error codes", () => {
  it("explains code 190 and 10", async () => {
    const e190 = fakeGraph([[/GET/, () => json({ error: { message: "x", code: 190 } }, 400)]]);
    await expect(connectInstagramToken("bad", {}, e190.fetchImpl, NOW)).rejects.toThrow(/再接続/);
    const e10 = fakeGraph([[/GET/, () => json({ error: { message: "x", code: 10 } }, 400)]]);
    await expect(connectInstagramToken("bad", {}, e10.fetchImpl, NOW)).rejects.toThrow(/権限が不足/);
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

  it("publishes via graph.facebook.com for facebook_login", async () => {
    const { calls, fetchImpl } = fakeGraph([
      [/POST \/v26\.0\/178\/media$/, (call) => json({ id: call.params.media_type === "CAROUSEL" ? "carousel" : "child" })],
      [/GET \/v26\.0\/(child|carousel)$/, () => json({ status_code: "FINISHED" })],
      [/POST \/v26\.0\/178\/media_publish/, () => json({ id: "m1" })],
      [/GET \/v26\.0\/m1/, () => json({ permalink: "https://instagram.com/p/x" })]
    ]);
    const result = await publishInstagramCarousel({
      ...base,
      provider: "facebook_login",
      imageUrls: ["https://a/1.jpg", "https://a/2.jpg"],
      fetchImpl
    });
    expect(result.mediaId).toBe("m1");
    expect(calls.every((c) => c.host === "graph.facebook.com")).toBe(true);
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
