/** Text documents a human can upload to the reference library as ideation context. */
export const REFERENCE_FILE_MAX_BYTES = 200_000;
export const REFERENCE_TEXT_MAX_CHARS = 20_000;
const ALLOWED_EXTENSIONS = ["txt", "md"] as const;

export class ReferenceFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceFileError";
  }
}

export interface ParsedReferenceFile {
  title: string;
  text: string;
  truncated: boolean;
}

function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot + 1).toLowerCase() };
}

/** Validate an uploaded .txt/.md file and turn it into reference text. Throws ReferenceFileError. */
export function parseReferenceFile(input: {
  name: string;
  bytes: Uint8Array;
  title?: string;
}): ParsedReferenceFile {
  const { base, ext } = splitName(input.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ReferenceFileError(`Unsupported file type: use ${ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(" or ")}`);
  }
  if (input.bytes.byteLength > REFERENCE_FILE_MAX_BYTES) {
    throw new ReferenceFileError(`File too large (max ${REFERENCE_FILE_MAX_BYTES} bytes)`);
  }
  if (input.bytes.includes(0)) {
    throw new ReferenceFileError("File is not valid text");
  }
  const text = new TextDecoder("utf-8")
    .decode(input.bytes)
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) throw new ReferenceFileError("File is empty");
  const truncated = text.length > REFERENCE_TEXT_MAX_CHARS;
  return {
    title: input.title?.trim() || base,
    text: truncated ? text.slice(0, REFERENCE_TEXT_MAX_CHARS) : text,
    truncated
  };
}
