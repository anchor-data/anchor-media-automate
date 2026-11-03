import { DEFAULT_DESIGN_SPEC, designSpecSchema, ensureReadable, type DesignSpec } from "./spec";

/** FNV-1a: a stable 32-bit hash of the seed. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (const char of seed) {
    h ^= char.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small seeded generator, good enough to spread choices. */
function rng(seed: string): () => number {
  let state = hash(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/**
 * A slightly different take on the account's design for one post, deterministic per `seed` (use the
 * post id). What may vary is bounded by `layout.variety`; colors come only from the account's own
 * accent set, and readability is re-checked for whichever accent was chosen.
 */
export function varySpec(spec: DesignSpec, seed: string): DesignSpec {
  if (spec.layout.variety === "none") return spec;
  const random = rng(seed);

  const accents = [spec.theme.accent, ...spec.theme.accentAlternates.filter((color) => color !== spec.theme.accent)];
  const accent = pick(random, accents);
  // Keep the account's own number side about half of the time.
  const numberAlign = random() < 0.5 ? spec.layout.numberAlign : pick(random, ["left", "right"] as const);

  let next: DesignSpec = {
    ...spec,
    theme: { ...spec.theme, accent },
    layout: { ...spec.layout, numberAlign }
  };

  if (spec.layout.variety === "lively") {
    const underlineHeads = random() < 0.35 ? !spec.type.underlineHeads : spec.type.underlineHeads;
    const decor = random() < 0.25 ? pick(random, ["blobs", "dots", "stripes"] as const) : spec.layout.decor;
    next = { ...next, type: { ...next.type, underlineHeads }, layout: { ...next.layout, decor } };
  }
  return ensureReadable(next);
}

/** Parse stored JSON into a DesignSpec; null when it is missing or invalid. */
function parseSpec(raw: unknown): DesignSpec | null {
  if (raw === null || raw === undefined) return null;
  const parsed = designSpecSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The design a post renders with: the one already stored on the post (so re-renders and manual
 * regenerations stay stable), else the account's design varied by the post id, else the default look.
 */
export function resolvePostDesign(accountSpec: unknown, storedPostSpec: unknown, seed: string): DesignSpec {
  const stored = parseSpec(storedPostSpec);
  if (stored) return ensureReadable(stored);
  return varySpec(parseSpec(accountSpec) ?? DEFAULT_DESIGN_SPEC, seed);
}
