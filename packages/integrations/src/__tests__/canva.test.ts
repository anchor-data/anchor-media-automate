import { describe, expect, it, vi } from "vitest";
import { CanvaApiClient, resolveCanvaDesignId, type CanvaDesignCache, type CanvaTokenStore } from "../canva";

function memoryStore(initial: string | null): CanvaTokenStore & { current: () => string | null } {
  let token = initial;
  return {
    load: async () => token,
    save: async (next) => {
      token = next;
    },
    current: () => token
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function routedFetch(routes: Record<string, (init?: RequestInit) => Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = Object.keys(routes).find((route) => url.endsWith(route));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    return routes[key]!(init);
  });
}

const noSleep = async () => undefined;

describe("resolveCanvaDesignId", () => {
  it("reads the id from a design url", async () => {
    expect(await resolveCanvaDesignId("https://www.canva.com/design/DAFabc_12-x/edit")).toBe("DAFabc_12-x");
  });

  it("accepts a bare id", async () => {
    expect(await resolveCanvaDesignId("DAFabc")).toBe("DAFabc");
  });

  it("follows canva.link shortlinks", async () => {
    const fetchImpl = vi.fn(async () => {
      const response = new Response("");
      Object.defineProperty(response, "url", { value: "https://www.canva.com/design/DAFshort/view" });
      return response;
    });
    expect(await resolveCanvaDesignId("https://canva.link/abc", fetchImpl as unknown as typeof fetch)).toBe("DAFshort");
  });

  it("rejects unrelated hosts without fetching", async () => {
    const fetchImpl = vi.fn();
    expect(await resolveCanvaDesignId("https://example.com/x", fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("CanvaApiClient token handling", () => {
  it("persists the rotated refresh token and reuses the access token", async () => {
    const store = memoryStore("rt_old");
    const fetchImpl = routedFetch({
      "/oauth/token": () => json({ access_token: "at_1", expires_in: 3600, refresh_token: "rt_new" }),
      "/designs/D1": () => json({ design: { thumbnail: { url: "https://t", width: 10, height: 20 } } })
    });
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: store,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await client.getThumbnail("D1");
    await client.getThumbnail("D1");

    expect(store.current()).toBe("rt_new");
    const tokenCalls = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/oauth/token"));
    expect(tokenCalls).toHaveLength(1);
    const body = tokenCalls[0]![1]!.body as URLSearchParams;
    expect(body.get("refresh_token")).toBe("rt_old");
  });

  it("seeds from the env token only while the store is empty", async () => {
    const store = memoryStore(null);
    const fetchImpl = routedFetch({
      "/oauth/token": () => json({ access_token: "at", refresh_token: "rt_next" }),
      "/designs/D1": () => json({ design: {} })
    });
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      seedRefreshToken: "rt_seed",
      tokenStore: store,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await client.getThumbnail("D1");
    const body = fetchImpl.mock.calls[0]![1]!.body as URLSearchParams;
    expect(body.get("refresh_token")).toBe("rt_seed");
    expect(store.current()).toBe("rt_next");
  });

  it("shares one refresh between concurrent requests", async () => {
    const store = memoryStore("rt");
    const fetchImpl = routedFetch({
      "/oauth/token": () => json({ access_token: "at", refresh_token: "rt2" }),
      "/designs/D1": () => json({ design: {} })
    });
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: store,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await Promise.all([client.getThumbnail("D1"), client.getThumbnail("D1"), client.getThumbnail("D1")]);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/oauth/token"))).toHaveLength(1);
  });

  it("shares one refresh across separate clients that share state", async () => {
    const store = memoryStore("rt");
    const shared = {};
    const fetchImpl = routedFetch({
      "/oauth/token": () => json({ access_token: "at", refresh_token: "rt2" }),
      "/designs/D1": () => json({ design: {} })
    });
    const make = () =>
      new CanvaApiClient({
        clientId: "id",
        clientSecret: "secret",
        tokenStore: store,
        shared,
        fetchImpl: fetchImpl as unknown as typeof fetch
      });
    await Promise.all([make().getThumbnail("D1"), make().getThumbnail("D1"), make().getThumbnail("D1")]);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith("/oauth/token"))).toHaveLength(1);
  });

  it("retries with the newer stored token when another process already rotated it", async () => {
    const store = memoryStore("rt_old");
    const used: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/oauth/token")) {
        const token = (init?.body as URLSearchParams).get("refresh_token") ?? "";
        used.push(token);
        if (token === "rt_old") {
          await store.save("rt_new"); // a concurrent request rotated it first
          return json({ error: "invalid_grant", error_description: "Refresh token used twice" }, 400);
        }
        return json({ access_token: "at", refresh_token: "rt_next" });
      }
      return json({ design: {} });
    });
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: store,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await client.getThumbnail("D1");
    expect(used).toEqual(["rt_old", "rt_new"]);
    expect(store.current()).toBe("rt_next");
  });

  it("does not retry when the stored token is unchanged", async () => {
    const store = memoryStore("rt_dead");
    const fetchImpl = routedFetch({
      "/oauth/token": () => json({ error: "invalid_grant", error_description: "Token lineage has been revoked" }, 400)
    });
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: store,
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await expect(client.getThumbnail("D1")).rejects.toThrow(/lineage has been revoked/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when the rotated token cannot be persisted", async () => {
    const store: CanvaTokenStore = {
      load: async () => "rt",
      save: async () => {
        throw new Error("db down");
      }
    };
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: store,
      fetchImpl: routedFetch({
        "/oauth/token": () => json({ access_token: "at", refresh_token: "rt2" })
      }) as unknown as typeof fetch
    });
    await expect(client.getThumbnail("D1")).rejects.toThrow(/failed to persist the rotated refresh token: db down/);
  });

  it("reports not-configured when there is no refresh token anywhere", async () => {
    const client = new CanvaApiClient({ clientId: "id", clientSecret: "secret", tokenStore: memoryStore(null) });
    await expect(client.exportPages("D1")).rejects.toThrow(/not configured/i);
  });
});

describe("CanvaApiClient export", () => {
  const tokenRoute = { "/oauth/token": () => json({ access_token: "at" }) };

  it("exports every page and serves repeat calls from the cache", async () => {
    const cache = new Map<string, string[]>();
    const designCache: CanvaDesignCache = {
      get: async (id) => cache.get(id) ?? null,
      set: async (id, urls) => {
        cache.set(id, urls);
      }
    };
    const fetchImpl = routedFetch({
      ...tokenRoute,
      "/exports": () => json({ job: { id: "e1", status: "in_progress" } }),
      "/exports/e1": () => json({ job: { id: "e1", status: "success", urls: ["u1", "u2", "u3"] } })
    });
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: memoryStore("rt"),
      designCache,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep
    });

    expect(await client.exportPages("D1")).toEqual(["u1", "u2", "u3"]);
    const callsAfterFirst = fetchImpl.mock.calls.length;
    expect(await client.exportPages("D1")).toEqual(["u1", "u2", "u3"]);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst);
  });

  it("surfaces a failed export job", async () => {
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: memoryStore("rt"),
      sleep: noSleep,
      fetchImpl: routedFetch({
        ...tokenRoute,
        "/exports": () => json({ job: { id: "e2", status: "failed", error: { message: "bad design" } } })
      }) as unknown as typeof fetch
    });
    await expect(client.exportPages("D2")).rejects.toThrow(/bad design/);
  });

  it("returns null when the design has no thumbnail", async () => {
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: memoryStore("rt"),
      fetchImpl: routedFetch({ ...tokenRoute, "/designs/D1": () => json({ design: {} }) }) as unknown as typeof fetch
    });
    expect(await client.getThumbnail("D1")).toBeNull();
  });
});

describe("importFile", () => {
  const tokenRoute = { "/oauth/token": () => json({ access_token: "at" }) };
  const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const done = { job: { id: "J5", status: "success", result: { designs: [{ id: "D5", urls: { edit_url: "https://canva.com/edit/D5" } }] } } };

  function importing(onImport: (init?: RequestInit) => void) {
    return new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: memoryStore("rt"),
      sleep: noSleep,
      fetchImpl: routedFetch({
        ...tokenRoute,
        "/imports": (init) => {
          onImport(init);
          return json(done);
        }
      }) as unknown as typeof fetch
    });
  }

  it("sends the given mime type", async () => {
    let meta = "";
    await importing((init) => {
      meta = (init?.headers as Record<string, string>)["Import-Metadata"] ?? "";
    }).importFile({ title: "deck", bytes: new Uint8Array([1]), mimeType: PPTX });
    expect((JSON.parse(meta) as { mime_type: string }).mime_type).toBe(PPTX);
  });

  it("keeps the title within Canva's 50 character limit", async () => {
    let meta = "";
    await importing((init) => {
      meta = (init?.headers as Record<string, string>)["Import-Metadata"] ?? "";
    }).importFile({ title: "あ".repeat(80), bytes: new Uint8Array([1]), mimeType: PPTX });
    const title = new TextDecoder().decode(Uint8Array.from(atob((JSON.parse(meta) as { title_base64: string }).title_base64), (c) => c.charCodeAt(0)));
    expect(Array.from(title).length).toBe(50);
  });

  it("the mock client accepts any file", async () => {
    const { MockCanvaClient } = await import("../canva");
    const design = await new MockCanvaClient().importFile({ title: "x", bytes: new Uint8Array([1]), mimeType: PPTX });
    expect(design.designId).toMatch(/^design_/);
  });
});
