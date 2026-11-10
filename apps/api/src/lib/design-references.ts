/**
 * Reference screenshots a design was derived from. Kept in the image bucket under a folder per
 * account (no database rows), so the design page can show what the current look is based on.
 */

const PREFIX = "design-refs/";
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

const folder = (accountId: string): string => `${PREFIX}${accountId}/`;

export const isDesignReferenceName = (name: string): boolean => NAME_PATTERN.test(name);

export function designReferenceKey(accountId: string, name: string): string {
  return `${folder(accountId)}${name}`;
}

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: match[1]! };
}

export async function listDesignReferences(bucket: R2Bucket, accountId: string): Promise<string[]> {
  const prefix = folder(accountId);
  const listed = await bucket.list({ prefix });
  return listed.objects.map((object) => object.key.slice(prefix.length)).sort();
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
  screenshots: readonly string[]
): Promise<void> {
  const batch = Date.now().toString(36);
  const parsed = screenshots.map(parseDataUrl).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  if (parsed.length === 0) return;
  await deleteDesignReferences(bucket, accountId);
  await Promise.all(
    parsed.map((entry, index) =>
      bucket.put(designReferenceKey(accountId, `${batch}-${String(index).padStart(2, "0")}.jpg`), entry.bytes, {
        httpMetadata: { contentType: entry.contentType }
      })
    )
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** The saved references as image data URLs, so a rebuild without new screenshots still sees them. */
export async function loadDesignReferenceImages(bucket: R2Bucket, accountId: string): Promise<string[]> {
  const names = await listDesignReferences(bucket, accountId);
  const loaded = await Promise.all(
    names.map(async (name) => {
      const object = await bucket.get(designReferenceKey(accountId, name));
      if (!object) return null;
      const type = object.httpMetadata?.contentType ?? "image/jpeg";
      return `data:${type};base64,${toBase64(new Uint8Array(await object.arrayBuffer()))}`;
    })
  );
  return loaded.filter((image): image is string => image !== null);
}
