/**
 * Reference screenshots a design was derived from. Kept in the image bucket under a folder per
 * account (no database rows), so the design page can show what the current look is based on.
 *
 * Each reference may say which page of the carousel it shows (1 = cover ...). That page number lives
 * in the file name (`<batch>-<nn>-p<page>.jpg`, p0 = not set), so it needs no database either.
 */

const PREFIX = "design-refs/";
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const PAGE_SUFFIX = /(-p\d{1,2})?\.jpg$/;
const MAX_PAGE = 10;

const folder = (accountId: string): string => `${PREFIX}${accountId}/`;

export const isDesignReferenceName = (name: string): boolean => NAME_PATTERN.test(name);

export function designReferenceKey(accountId: string, name: string): string {
  return `${folder(accountId)}${name}`;
}

/** A reference's page number, or null when it was not set (or the name predates page numbers). */
export function referencePage(name: string): number | null {
  const match = /-p(\d{1,2})\.jpg$/.exec(name);
  const page = match ? Number(match[1]) : 0;
  return page >= 1 && page <= MAX_PAGE ? page : null;
}

export const referenceNameWithPage = (name: string, page: number | null): string =>
  `${name.replace(PAGE_SUFFIX, "")}-p${page ?? 0}.jpg`;

export type DesignReferenceItem = { name: string; page: number | null; palette?: string };

/** A screenshot to keep (image data URL) and the page it shows, if known. */
export type ReferenceScreenshot = { src: string; page: number | null; palette?: string };

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: match[1]! };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function listDesignReferences(bucket: R2Bucket, accountId: string): Promise<DesignReferenceItem[]> {
  const prefix = folder(accountId);
  const listed = await bucket.list({ prefix, include: ["customMetadata"] });
  return listed.objects
    .map((object) => ({ name: object.key.slice(prefix.length), palette: object.customMetadata?.palette }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, palette }) => ({ name, page: referencePage(name), ...(palette ? { palette } : {}) }));
}

export async function deleteDesignReferences(bucket: R2Bucket, accountId: string): Promise<void> {
  const prefix = folder(accountId);
  const listed = await bucket.list({ prefix });
  if (listed.objects.length > 0) await bucket.delete(listed.objects.map((object) => object.key));
}

/** Replace the account's saved references with these screenshots (image data URLs; other values are skipped). */
export async function replaceDesignReferences(
  bucket: R2Bucket,
  accountId: string,
  screenshots: readonly ReferenceScreenshot[]
): Promise<void> {
  const batch = Date.now().toString(36);
  const parsed = screenshots.flatMap(({ src, page, palette }) => {
    const file = parseDataUrl(src);
    return file ? [{ ...file, page, palette }] : [];
  });
  if (parsed.length === 0) return;
  await deleteDesignReferences(bucket, accountId);
  await Promise.all(
    parsed.map((entry, index) =>
      bucket.put(designReferenceKey(accountId, referenceNameWithPage(`${batch}-${String(index).padStart(2, "0")}.jpg`, entry.page)), entry.bytes, {
        httpMetadata: { contentType: entry.contentType },
        customMetadata: entry.palette ? { palette: entry.palette } : undefined
      })
    )
  );
}

/** Keep one more screenshot for a page. Returns its item, or null when the data is not an image. */
export async function addDesignReference(
  bucket: R2Bucket,
  accountId: string,
  screenshot: string,
  page: number | null,
  palette = ""
): Promise<DesignReferenceItem | null> {
  const file = parseDataUrl(screenshot);
  if (!file) return null;
  const name = referenceNameWithPage(`${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}.jpg`, page);
  await bucket.put(designReferenceKey(accountId, name), file.bytes, {
    httpMetadata: { contentType: file.contentType },
    customMetadata: palette ? { palette: palette.slice(0, 200) } : undefined
  });
  return { name, page };
}

/** Say which page a saved reference shows (null clears it). Files cannot be renamed, so it is copied under the new name. */
export async function setDesignReferencePage(
  bucket: R2Bucket,
  accountId: string,
  name: string,
  page: number | null
): Promise<string | null> {
  const object = await bucket.get(designReferenceKey(accountId, name));
  if (!object) return null;
  const next = referenceNameWithPage(name, page);
  if (next === name) return name;
  await bucket.put(designReferenceKey(accountId, next), await object.arrayBuffer(), {
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata
  });
  await bucket.delete(designReferenceKey(accountId, name));
  return next;
}

/** The saved references as image data URLs (with their pages), so a rebuild without new screenshots still sees them. */
export async function loadDesignReferenceImages(bucket: R2Bucket, accountId: string): Promise<ReferenceScreenshot[]> {
  const items = await listDesignReferences(bucket, accountId);
  const loaded = await Promise.all(
    items.map(async ({ name, page }): Promise<ReferenceScreenshot | null> => {
      const object = await bucket.get(designReferenceKey(accountId, name));
      if (!object) return null;
      const type = object.httpMetadata?.contentType ?? "image/jpeg";
      return { src: `data:${type};base64,${toBase64(new Uint8Array(await object.arrayBuffer()))}`, page, ...(object.customMetadata?.palette ? { palette: object.customMetadata.palette } : {}) };
    })
  );
  return loaded.filter((image): image is ReferenceScreenshot => image !== null);
}

export type ReferenceFile = { bytes: Uint8Array; contentType: string; name: string; page: number | null };

/** The saved references as files (for the image model's reference input), oldest first. */
export async function loadDesignReferenceFiles(bucket: R2Bucket, accountId: string): Promise<ReferenceFile[]> {
  const items = await listDesignReferences(bucket, accountId);
  const loaded = await Promise.all(
    items.map(async ({ name, page }): Promise<ReferenceFile | null> => {
      const object = await bucket.get(designReferenceKey(accountId, name));
      if (!object) return null;
      return { bytes: new Uint8Array(await object.arrayBuffer()), contentType: object.httpMetadata?.contentType ?? "image/jpeg", name, page };
    })
  );
  return loaded.filter((file): file is ReferenceFile => file !== null);
}
