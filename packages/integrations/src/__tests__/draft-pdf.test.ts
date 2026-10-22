import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildDraftPdf } from "../draft-pdf";
import { DEFAULT_TEMPLATE_STRUCTURE, parseTemplateStructure } from "../template-structure";

describe("buildDraftPdf", () => {
  it("makes one 1080x1350 page per structure page", async () => {
    const bytes = await buildDraftPdf(DEFAULT_TEMPLATE_STRUCTURE);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(8);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 1080, height: 1350 });
  });

  it("follows a custom page count", async () => {
    const structure = parseTemplateStructure({
      pages: [
        { title: "Cover", purpose: "Hook", fields: [{ name: "s1_title", maxChars: 20 }] },
        { title: "CTA", purpose: "Follow", fields: [{ name: "s2_cta", maxChars: 24 }] }
      ]
    });
    const pdf = await PDFDocument.load(await buildDraftPdf(structure));
    expect(pdf.getPageCount()).toBe(2);
  });
});
