import { describe, expect, it, vi } from "vitest";
import {
  CanvaApiClient,
  REQUIRED_TEMPLATE_FIELDS,
  missingTemplateFields,
  resolveCanvaDesignId,
  toAutofillData,
  type CanvaDesignCache,
  type CanvaTokenStore
} from "../canva";

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

describe("toAutofillData", () => {
  it("wraps every field as a Canva text value", () => {
    expect(toAutofillData({ s1_title: "T", s1_sub: "S" })).toEqual({
      s1_title: { type: "text", text: "T" },
      s1_sub: { type: "text", text: "S" }
    });
  });
});

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

describe("CanvaApiClient autofill and export", () => {
  const tokenRoute = { "/oauth/token": () => json({ access_token: "at" }) };

  it("autofills text fields and returns the design id once the job succeeds", async () => {
    let polls = 0;
    const fetchImpl = routedFetch({
      ...tokenRoute,
      "/autofills": () => json({ job: { id: "j1", status: "in_progress" } }),
      "/autofills/j1": () => {
        polls += 1;
        return json({ job: { id: "j1", status: "success", result: { design: { id: "DNEW" } } } });
      }
    });
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: memoryStore("rt"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep
    });

    const result = await client.autofill({ templateId: "tpl", fields: { s1_title: "Hi" }, title: "Deck" });

    expect(result).toEqual({ designId: "DNEW" });
    expect(polls).toBe(1);
    const post = fetchImpl.mock.calls.find(([url]) => String(url).endsWith("/autofills"))!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      brand_template_id: "tpl",
      title: "Deck",
      data: { s1_title: { type: "text", text: "Hi" } }
    });
  });

  it("surfaces a failed Canva job", async () => {
    const fetchImpl = routedFetch({
      ...tokenRoute,
      "/autofills": () => json({ job: { id: "j1", status: "failed", error: { message: "bad field" } } })
    });
    const client = new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: memoryStore("rt"),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep
    });
    await expect(client.autofill({ templateId: "tpl", fields: {} })).rejects.toThrow(/bad field/);
  });

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

describe("brand templates", () => {
  const tokenRoute = { "/oauth/token": () => json({ access_token: "at" }) };
  const client = (routes: Record<string, (init?: RequestInit) => Response>) =>
    new CanvaApiClient({
      clientId: "id",
      clientSecret: "secret",
      tokenStore: memoryStore("rt"),
      fetchImpl: routedFetch({ ...tokenRoute, ...routes }) as unknown as typeof fetch
    });

  it("requires all 21 slide fields", () => {
    expect(REQUIRED_TEMPLATE_FIELDS).toHaveLength(21);
    expect(missingTemplateFields(REQUIRED_TEMPLATE_FIELDS)).toEqual([]);
    expect(missingTemplateFields(["s1_title"])).toContain("s8_cta");
  });

  it("lists templates across pages", async () => {
    const result = await client({
      "?limit=50": () =>
        json({ items: [{ id: "T1", title: "One", thumbnail: { url: "https://t/1" } }], continuation: "c2" }),
      "&continuation=c2": () => json({ items: [{ id: "T2" }] })
    }).listBrandTemplates();
    expect(result.map((t) => t.id)).toEqual(["T1", "T2"]);
    expect(result[0]!.thumbnailUrl).toBe("https://t/1");
    expect(result[1]!.title).toBe("T2");
  });

  it("reads dataset field names", async () => {
    const names = await client({
      "/brand-templates/T1/dataset": () => json({ dataset: { s1_title: { type: "text" }, s1_sub: { type: "text" } } })
    }).getTemplateFieldNames("T1");
    expect(names).toEqual(["s1_title", "s1_sub"]);
  });
});
