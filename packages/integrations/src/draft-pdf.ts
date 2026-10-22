import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TemplateStructure } from "./template-structure";

export const DRAFT_PAGE_WIDTH = 1080;
export const DRAFT_PAGE_HEIGHT = 1350;

const MARGIN = 80;
const HEADING_SIZE = 56;
const FIELD_SIZE = 40;
const NOTE_SIZE = 28;
const LINE_GAP = 84;

/**
 * One 1080x1350 page per structure page, each listing its autofill field names. Imported into
 * Canva it gives the user real pages to lay out and tag, instead of a blank single page.
 * Latin text only (standard font): the labels are field names, not post copy.
 */
export async function buildDraftPdf(structure: TemplateStructure): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const note = await pdf.embedFont(StandardFonts.Helvetica);

  structure.pages.forEach((page, index) => {
    const sheet = pdf.addPage([DRAFT_PAGE_WIDTH, DRAFT_PAGE_HEIGHT]);
    let y = DRAFT_PAGE_HEIGHT - MARGIN - HEADING_SIZE;
    sheet.drawText(`Page ${index + 1}`, { x: MARGIN, y, size: HEADING_SIZE, font, color: rgb(0.1, 0.2, 0.5) });
    for (const field of page.fields) {
      y -= LINE_GAP;
      sheet.drawText(`${field.name}  (max ${field.maxChars})`, {
        x: MARGIN,
        y,
        size: FIELD_SIZE,
        font: note,
        color: rgb(0.15, 0.15, 0.15)
      });
    }
    sheet.drawText("Replace with the real layout, then name each text box with the Data autofill app.", {
      x: MARGIN,
      y: MARGIN,
      size: NOTE_SIZE,
      font: note,
      color: rgb(0.45, 0.45, 0.45)
    });
  });
  return pdf.save();
}
