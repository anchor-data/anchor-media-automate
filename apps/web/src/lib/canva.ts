/** Canva page where a brand template can be viewed and used. */
export function canvaTemplateUrl(templateId: string): string {
  return `https://www.canva.com/brand/brand-templates/${encodeURIComponent(templateId)}`;
}

/** Real Canva design ids start with "D"; the mock client's ids do not, so they get no link. */
const CANVA_DESIGN_ID_RE = /^D[A-Za-z0-9_-]{9,}$/;

/** Canva editor page for a generated design, or null when the id is not a real Canva design. */
export function canvaDesignUrl(designId: string | undefined): string | null {
  if (!designId || !CANVA_DESIGN_ID_RE.test(designId)) return null;
  return `https://www.canva.com/design/${encodeURIComponent(designId)}/edit`;
}
