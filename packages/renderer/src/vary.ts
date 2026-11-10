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
 *
 * Background artwork varies too: which variant a post uses, whether it is mirrored and how it is
 * cropped (subtle keeps the crop near the middle; lively uses the whole range). The artwork is
 * chosen last, so adding it did not change what the other choices were for an existing seed.
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
    const structure = random() < 0.3 ? pick(random, ["classic", "split", "banner"] as const) : spec.layout.structure;
    next = { ...next, type: { ...next.type, underlineHeads }, layout: { ...next.layout, decor, structure } };
  }

  const bgVariant = Math.floor(random() * 10);
  const bgFlip = random() < 0.5;
  const spread = spec.layout.variety === "lively" ? 1 : 0.4;
  const bgOffset = Math.round((0.5 + (random() - 0.5) * spread) * 100) / 100;
  next = { ...next, layout: { ...next.layout, bgVariant, bgFlip, bgOffset } };

  if (spec.layout.variety === "lively") {
    // Corner roundness and number size: small steps, so the account's own look stays recognizable.
    const radius = Math.round(pick(random, [spec.layout.radius, spec.layout.radius * 0.5, Math.min(64, spec.layout.radius * 1.4)]));
    const numScale = Math.round(Math.min(1.2, Math.max(0.6, spec.type.numScale * (0.9 + random() * 0.2))) * 100) / 100;
    next = { ...next, type: { ...next.type, numScale }, layout: { ...next.layout, radius } };
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
