/** Canva page where a brand template can be viewed and used. */
export function canvaTemplateUrl(templateId: string): string {
  return `https://www.canva.com/brand/brand-templates/${encodeURIComponent(templateId)}`;
}
