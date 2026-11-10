import { generateSlideImage, type ReferenceImage } from "@ama/integrations";
import { SLIDE_ROLES, type SlideRole } from "@ama/shared";

/**
 * Background artwork of an account's design: full-page pictures (no text) generated from the
 * reference screenshots, several variants per page role. Posts draw their text on top. Files live in
 * the image bucket under a folder per account; the bucket listing is the only record of them.
 */

/** Variants per role: each post picks one, so posts of one account do not all share the same picture. */
export const BACKGROUND_VARIANTS = 2;

const PREFIX = "design-bg/";
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const folder = (accountId: string): string => `${PREFIX}${accountId}/`;

export const isBackgroundName = (name: string): boolean => NAME_PATTERN.test(name);
export const isSlideRole = (value: string): value is SlideRole => (SLIDE_ROLES as readonly string[]).includes(value);
export const backgroundKey = (accountId: string, name: string): string => `${folder(accountId)}${name}`;

const roleOfName = (name: string): SlideRole | null => {
  const role = name.split("-")[0] ?? "";
  return isSlideRole(role) ? role : null;
};

export type BackgroundEntry = { role: SlideRole; name: string };

export async function listBackgrounds(bucket: R2Bucket, accountId: string): Promise<BackgroundEntry[]> {
  const prefix = folder(accountId);
  const listed = await bucket.list({ prefix });
  return listed.objects
    .map((object) => object.key.slice(prefix.length))
    .sort()
    .flatMap((name) => {
      const role = roleOfName(name);
      return role ? [{ role, name }] : [];
    });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** The account's artwork as data URLs by role, for the PPTX render. Empty when none was generated. */
export async function loadBackgroundImages(
  bucket: R2Bucket,
  accountId: string
): Promise<Partial<Record<SlideRole, string[]>>> {
  const entries = await listBackgrounds(bucket, accountId);
  const loaded = await Promise.all(
    entries.map(async ({ role, name }) => {
      const object = await bucket.get(backgroundKey(accountId, name));
      if (!object) return null;
      const type = object.httpMetadata?.contentType ?? "image/jpeg";
      return { role, src: `data:${type};base64,${toBase64(new Uint8Array(await object.arrayBuffer()))}` };
    })
  );
  const byRole: Partial<Record<SlideRole, string[]>> = {};
  for (const item of loaded) {
    if (item) byRole[item.role] = [...(byRole[item.role] ?? []), item.src];
  }
  return byRole;
}

export async function deleteBackgrounds(bucket: R2Bucket, accountId: string): Promise<void> {
  const listed = await bucket.list({ prefix: folder(accountId) });
  if (listed.objects.length > 0) await bucket.delete(listed.objects.map((object) => object.key));
}

const ROLE_SCENE: Record<SlideRole, string> = {
  cover: "the cover page: the most eye-catching page, bolder decoration, with a calm area for a large title",
  empathy: "a page that names a reader's worry: gentle, soft decoration",
  point: "a know-how page with one numbered point: clean and calm, light decoration",
  pick: "a recommendation / summary page: tidy, slightly richer decoration",
  cta: "the closing call-to-action page: friendly, a little celebratory"
};

const VARIANT_HINT = [
  "",
  "Arrange the decoration differently from the most obvious layout of this style: put it on other sides and corners."
];

export interface BackgroundPromptInput {
  role: SlideRole;
  variant: number;
  /** How many of the first reference images show this very page type. */
  matching?: number;
  /** Design colors the artwork should stay within. */
  palette: Readonly<Record<string, string>>;
}

export function backgroundPrompt({ role, variant, palette, matching = 0 }: BackgroundPromptInput): string {
  const colors = Object.entries(palette).map(([name, value]) => `${name} ${value}`).join(", ");
  return [
    `Background artwork for ${ROLE_SCENE[role]} of an Instagram carousel (portrait page).`,
    "Make it creative and eye-catching so it stops people mid-scroll, with a distinct personality rather than a generic pattern.",
    "Follow the reference images' visual style closely: illustration style, shapes, textures, line quality, decoration density, frame / border treatment and color feel. Reuse the style only, never their text, characters or logos.",
    matching > 0
      ? `The first ${matching} reference image${matching > 1 ? "s show" : " shows"} this very kind of page: match ${matching > 1 ? "their" : "its"} composition, decoration and mood most closely; the other images only add style context.`
      : "",
    `Stay within this palette: ${colors}.`,
    `Hard rules: no text, letters, numbers, logos, watermarks, UI or faces. Keep the central area (about 80% of the width and 65% of the height) calm: a nearly flat tone close to the panel color${palette.panel ? ` (${palette.panel})` : ""} with no busy detail, because text in a fixed color is laid over it. Put the decoration mainly around the edges and corners; the bottom 11% will be covered by a bar.`,
    VARIANT_HINT[variant] ?? VARIANT_HINT[1]!
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate the variants of one role and swap them in for the old ones (the new files are stored before
 * the old ones are removed, so a failure never leaves the role without artwork). Returns the cost.
 */
export async function regenerateRoleBackgrounds(input: {
  bucket: R2Bucket;
  apiKey: string | undefined;
  accountId: string;
  role: SlideRole;
  references: readonly ReferenceImage[];
  /** How many of the first `references` show this role's page (they are ordered first). */
  matching?: number;
  palette: Readonly<Record<string, string>>;
}): Promise<{ names: string[]; costUsd: number }> {
  const { bucket, accountId, role } = input;
  const previous = (await listBackgrounds(bucket, accountId)).filter((entry) => entry.role === role);
  const batch = Date.now().toString(36);

  const generated = await Promise.all(
    Array.from({ length: BACKGROUND_VARIANTS }, async (_, variant) => {
      const image = await generateSlideImage({
        apiKey: input.apiKey,
        prompt: backgroundPrompt({ role, variant, palette: input.palette, matching: input.matching }),
        references: input.references,
        size: "1024x1536",
        format: "jpeg",
        // Decorative artwork under text: medium costs about a quarter of high ($0.057 per image).
        quality: "medium",
        label: `background ${role} ${variant}`
      });
      const name = `${role}-${batch}-${variant}.jpg`;
      await bucket.put(backgroundKey(accountId, name), image.bytes, { httpMetadata: { contentType: image.contentType } });
      return { name, costUsd: image.costUsd ?? 0 };
    })
  );
  if (previous.length > 0) await bucket.delete(previous.map((entry) => backgroundKey(accountId, entry.name)));
  return { names: generated.map((item) => item.name), costUsd: generated.reduce((sum, item) => sum + item.costUsd, 0) };
}
