import "server-only";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export async function extractPdfPages(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const pdf = await getDocument({ data: bytes }).promise;
  const pages: ExtractedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      pages.push({ pageNumber, text });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}
