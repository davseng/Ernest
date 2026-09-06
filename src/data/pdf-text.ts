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

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
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

function cleanText(text: string) {
  return text.replace(/\u0000/g, "").replace(/[\t ]+/g, " ").trim();
}

function textWithLayout(items: PositionedText[]) {
  if (items.length === 0) return "";

  // PDF text items include x/y coordinates. Grouping close y positions into
  // lines preserves substantially more table/list structure than flattening
  // every item into one whitespace-normalized paragraph.
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: PositionedText[][] = [];
  for (const item of sorted) {
    const current = lines.at(-1);
    if (!current || Math.abs(current[0].y - item.y) > 2) lines.push([item]);
    else current.push(item);
  }

  return lines
    .map((line) => {
      const cells = [...line].sort((a, b) => a.x - b.x);
      let output = "";
      let previousEnd: number | undefined;
      for (const cell of cells) {
        const text = cleanText(cell.text);
        if (!text) continue;
        if (output && previousEnd !== undefined) {
          const gap = cell.x - previousEnd;
          // A visibly larger horizontal gap is useful evidence of a new table
          // column. Tabs survive storage and are easier for downstream models
          // to interpret than a single generic space.
          output += gap > 12 ? "\t" : " ";
        }
        output += text;
        previousEnd = cell.x + Math.max(cell.width, 0);
      }
      return output.trim();
    })
    .filter(Boolean)
    .join("\n")
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
      const items: PositionedText[] = content.items
        .filter((item) => "str" in item && item.str.trim())
        .map((item) => ({
          text: "str" in item ? item.str : "",
          x: "transform" in item ? item.transform[4] : 0,
          y: "transform" in item ? item.transform[5] : 0,
          width: "width" in item ? item.width : 0,
        }));

      pages.push({ pageNumber, text: textWithLayout(items) });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}
