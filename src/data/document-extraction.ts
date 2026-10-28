import "server-only";
import { indexSemanticPages } from "@/data/semantic-retrieval";
import { setSemanticStatus } from "@/data/document-processing";
import { visualPageNumbers } from "@/domain/visual-evidence";
import { replaceVisualPages, setProcessingStatus, visualCoverage } from "@/data/document-processing";

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

export async function processDocument(documentId: string, assetId: string, ownerId: string, forceVisual = false, visualStart = 1) {
  const document = await getDocumentForAsset(documentId, assetId, ownerId);
  if (!document) return { ok: false as const, notFound: true as const, message: "Document not found." };

  let stage = "read-storage";
  let visualStatus = "not_requested";
  try {
    await setProcessingStatus(documentId,assetId,ownerId,stage,visualStatus);
    const bytes = await readDocument(document.storageKey);

    stage = "pdf-extract";
    const nativePages = await extractPdfPages(bytes.slice());
    const requested = forceVisual ? nativePages.map(p=>p.pageNumber) : visualPageNumbers(document.title,nativePages);
    // Bound a request; report partial processing explicitly rather than claiming all pages were interpreted.
    const selected=requested.filter(n=>n>=visualStart).slice(0,12);
    let pages=nativePages, visualPages:ExtractedPage[]=[], visualError:string|null=null;
    if(selected.length){
      visualStatus="processing";
      await setProcessingStatus(documentId,assetId,ownerId,"visual",visualStatus);
      try {
        visualPages=await ocrPdfPages(bytes,document.originalFilename,selected);
        pages=mergeOcrPages(nativePages,visualPages.filter(p=>needsOcr(nativePages.find(n=>n.pageNumber===p.pageNumber)!)).map(p=>({...p,text:p.text.split("\nVisual relationships (unverified):")[0]})));
        visualStatus=requested.length>selected.length?"partial":"complete_unverified";
      }catch(error){visualStatus="failed";visualError=error instanceof Error?error.message:"Visual processing failed";}
    }

    stage = "database-write";
    const stored = await replaceDocumentPages(documentId, assetId, ownerId, pages);
    if (!stored) return { ok: false as const, notFound: true as const, message: "Document not found." };
    if(visualPages.length){
      await replaceVisualPages(documentId,assetId,ownerId,visualPages);
      visualStatus=await visualCoverage(documentId,assetId,ownerId,requested)>=requested.length?"complete_unverified":"partial";
    }
    await setProcessingStatus(documentId,assetId,ownerId,"indexed",visualStatus,visualError);
    try {
      await setSemanticStatus(documentId,assetId,ownerId,await indexSemanticPages(documentId,assetId,ownerId,pages));
    } catch { await setSemanticStatus(documentId,assetId,ownerId,"failed"); }
    try {
      const classification = await classifyDocument(documentId, assetId, ownerId);
      const findings = await extractDocumentFindings(pages, classification.ok ? classification.documentType : undefined);
      await replaceDocumentFindings(documentId, assetId, ownerId, findings);
      // Source processing extracts evidence only; status changes require owner review.
    } catch (error) {
      console.error("Document understanding failed", error);
      await setProcessingStatus(documentId,assetId,ownerId,"understanding_failed",visualStatus,"Text indexed; classification or historical finding extraction failed. Retry processing to refresh understanding.");
    }
    return { ok: true as const, pageCount: pages.length };
  } catch (error) {
    console.error(`Document text extraction failure at ${stage}`, error);
    const detail = error instanceof Error ? error.message : "Unknown extraction error";
    const message = `[${stage}] ${detail}`.replace(/\u0000/g, "").slice(0, 500);
    await setProcessingStatus(documentId,assetId,ownerId,stage,visualStatus,message);
    await markDocumentExtractionError(documentId, assetId, ownerId, message);
    return { ok: false as const, notFound: false as const, message };
  }
}
