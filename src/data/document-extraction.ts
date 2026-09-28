import "server-only";

import { classifyDocument } from "@/data/document-classification";
import { extractDocumentFindings, replaceDocumentFindings } from "@/data/document-findings";

import {
  getDocumentForAsset,
  markDocumentExtractionError,
  replaceDocumentPages,
} from "@/data/documents";
import { readDocument } from "@/data/document-storage";
import { ocrPdfPages } from "@/data/pdf-ocr";
import { extractPdfPages, type ExtractedPage } from "@/data/pdf-text";

function usefulCharacterCount(text: string) {
  return (text.match(/[A-Za-z0-9]/g) ?? []).length;
}

function needsOcr(page: ExtractedPage) {
  return usefulCharacterCount(page.text) < 80;
}

function mergeOcrPages(nativePages: ExtractedPage[], ocrPages: ExtractedPage[]) {
  const ocrByPage = new Map(ocrPages.map((page) => [page.pageNumber, page]));
  return nativePages.map((nativePage) => {
    const ocrPage = ocrByPage.get(nativePage.pageNumber);
    if (!ocrPage) return nativePage;
    return usefulCharacterCount(ocrPage.text) > usefulCharacterCount(nativePage.text)
      ? ocrPage
      : nativePage;
  });
}

export async function processDocument(documentId: string, assetId: string, ownerId: string) {
  const document = await getDocumentForAsset(documentId, assetId, ownerId);
  if (!document) return { ok: false as const, notFound: true as const, message: "Document not found." };

  let stage = "read-storage";
  try {
    const bytes = await readDocument(document.storageKey);

    stage = "pdf-extract";
    const nativePages = await extractPdfPages(bytes.slice());
    const weakPageNumbers = nativePages.filter(needsOcr).map((page) => page.pageNumber);

    let pages = nativePages;
    if (weakPageNumbers.length > 0) {
      stage = "ocr-fallback";
      const ocrPages = await ocrPdfPages(bytes, document.originalFilename, weakPageNumbers);
      pages = mergeOcrPages(nativePages, ocrPages);
    }

    stage = "database-write";
    const stored = await replaceDocumentPages(documentId, assetId, ownerId, pages);
    if (!stored) return { ok: false as const, notFound: true as const, message: "Document not found." };
    try {\n      const classification = await classifyDocument(documentId, assetId, ownerId);\n      const findings = await extractDocumentFindings(pages, classification.ok ? classification.documentType : undefined);\n      await replaceDocumentFindings(documentId, assetId, ownerId, findings);\n    } catch (error) { console.error("Document understanding failed", error); }
    return { ok: true as const, pageCount: pages.length };
  } catch (error) {
    console.error(`Document text extraction failure at ${stage}`, error);
    const detail = error instanceof Error ? error.message : "Unknown extraction error";
    const message = `[${stage}] ${detail}`.replace(/\u0000/g, "").slice(0, 500);
    await markDocumentExtractionError(documentId, assetId, ownerId, message);
    return { ok: false as const, notFound: false as const, message };
  }
}
