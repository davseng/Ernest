import "server-only";

import type { ExtractedDocumentPage } from "@/domain/documents";

export type DocumentChunk = {
  pageNumber: number;
  chunkIndex: number;
  text: string;
};

const TARGET_CHARS = 1200;
const OVERLAP_CHARS = 200;

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function chunkExtractedPages(pages: ExtractedDocumentPage[]): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const page of pages) {
    const text = normalize(page.text);
    if (!text) continue;

    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {
      let end = Math.min(start + TARGET_CHARS, text.length);

      if (end < text.length) {
        const sentenceBreak = text.lastIndexOf(". ", end);
        const spaceBreak = text.lastIndexOf(" ", end);
        const preferredBreak = sentenceBreak > start + TARGET_CHARS / 2
          ? sentenceBreak + 1
          : spaceBreak > start + TARGET_CHARS / 2
            ? spaceBreak
            : end;
        end = preferredBreak;
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText) {
        chunks.push({ pageNumber: page.pageNumber, chunkIndex, text: chunkText });
        chunkIndex += 1;
      }

      if (end >= text.length) break;
      start = Math.max(end - OVERLAP_CHARS, start + 1);
    }
  }

  return chunks;
}
