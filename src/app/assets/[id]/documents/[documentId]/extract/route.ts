import { NextResponse } from "next/server";

import { auth } from "@/auth";
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

    // Keep the more informative representation. This prevents a poor OCR pass
    // from replacing embedded text that was already more useful.
    return usefulCharacterCount(ocrPage.text) > usefulCharacterCount(nativePage.text)
      ? ocrPage
      : nativePage;
  });
}

export async function POST(request: Request, context: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id: assetId, documentId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/sign-in", request.url), 303);
  }

  const document = await getDocumentForAsset(documentId, assetId, session.user.id);
  if (!document) return new NextResponse("Not found", { status: 404 });

  let stage = "read-storage";
  try {
    const bytes = await readDocument(document.storageKey);

    // PDF.js may transfer/detach the ArrayBuffer it receives while parsing.
    // Give native extraction its own copy so the original bytes remain intact
    // for OCR fallback later in the same request.
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
    const stored = await replaceDocumentPages(documentId, assetId, session.user.id, pages);
    if (!stored) return new NextResponse("Not found", { status: 404 });
  } catch (error) {
    console.error(`Document text extraction failure at ${stage}`, error);
    const detail = error instanceof Error ? error.message : "Unknown extraction error";
    const message = `[${stage}] ${detail}`.replace(/\u0000/g, "").slice(0, 500);
    await markDocumentExtractionError(documentId, assetId, session.user.id, message);
    const failure = new URL(`/assets/${encodeURIComponent(assetId)}/documents/${encodeURIComponent(documentId)}`, request.url);
    return NextResponse.redirect(failure, 303);
  }

  return NextResponse.redirect(
    new URL(`/assets/${encodeURIComponent(assetId)}/documents/${encodeURIComponent(documentId)}`, request.url),
    303,
  );
}
