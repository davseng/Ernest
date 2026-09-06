import "server-only";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

type PdfJsWorkerModule = {
  WorkerMessageHandler: unknown;
};

type PdfJsGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler: unknown;
  };
};

async function ensurePdfWorker() {
  const runtime = globalThis as PdfJsGlobal;
  if (runtime.pdfjsWorker?.WorkerMessageHandler) return;

  // pdfjs-dist's Node path uses a fake worker. Importing the worker explicitly
  // makes Next/Vercel trace it into the server deployment instead of relying
  // on PDF.js's runtime-relative dynamic import.
  // @ts-expect-error pdfjs-dist does not publish TypeScript declarations for this worker entrypoint.
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs")) as PdfJsWorkerModule;
  runtime.pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler };
}

function normalizeExtractedText(text: string) {
  // PostgreSQL text values cannot contain NUL bytes. Some PDFs expose embedded
  // NUL characters through their font/text encoding even though the visible
  // text is otherwise valid. Remove only those NULs, then normalize whitespace.
  return text
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractPdfPages(bytes: Uint8Array): Promise<ExtractedPage[]> {
  await ensurePdfWorker();

  const pdf = await getDocument({ data: bytes }).promise;
  const pages: ExtractedPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = normalizeExtractedText(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );

      pages.push({ pageNumber, text });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}
