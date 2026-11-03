/**
 * Japanese line wrapping done on our side. Canva wraps text between any two characters, which splits
 * words ("画面切/替"); so we choose the breaks (at word boundaries, with kinsoku rules) and ship the
 * text with explicit line breaks.
 */

const ASCII_UNITS = 0.55;
/** Must not start a line. */
const NO_LINE_START = /^[。、，．,.！？!?）」』】〉》〕ーぁぃぅぇぉっゃゅょゎ々]/;
/** Must not end a line. */
const NO_LINE_END = /[（「『【〈《〔]$/;

/** Width of a string in em: full-width characters are 1, ASCII about half. */
export function textUnits(text: string): number {
  let units = 0;
  for (const char of text) units += char.charCodeAt(0) < 0x80 ? ASCII_UNITS : 1;
  return Number(units.toFixed(4));
}

const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

function wrapParagraph(paragraph: string, maxUnits: number): string[] {
  const pieces: string[] = [];
  for (const { segment } of segmenter.segment(paragraph)) {
    // A word wider than a line is split into characters.
    if (textUnits(segment) > maxUnits) pieces.push(...Array.from(segment));
    else pieces.push(segment);
  }

  const lines: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const width = textUnits(current) + textUnits(piece);
    if (current !== "" && width > maxUnits) {
      // One unit of slack keeps closing punctuation with the word before it.
      if (NO_LINE_START.test(piece) && width <= maxUnits + 1) {
        current += piece;
        continue;
      }
      const opening = NO_LINE_END.exec(current)?.[0] ?? "";
      lines.push(opening ? current.slice(0, -opening.length) : current);
      current = opening;
    }
    current += piece;
  }
  if (current !== "") lines.push(current);
  return lines;
}

/** Insert line breaks so no line is wider than `maxUnits` em. Existing line breaks are kept. */
export function wrapJapanese(text: string, maxUnits: number): string {
  if (text === "") return "";
  return text
    .split("\n")
    .flatMap((paragraph) => (paragraph === "" ? [""] : wrapParagraph(paragraph, maxUnits)))
    .join("\n");
}
