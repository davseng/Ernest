import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  getDocumentForAsset,
  markDocumentExtractionError,
  replaceDocumentPages,
} from "@/data/documents";
import { readDocument } from "@/data/document-storage";
import { extractPdfPages } from "@/data/pdf-text";

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

  try {
    const bytes = await readDocument(document.storageKey);
    const pages = await extractPdfPages(bytes);
    const stored = await replaceDocumentPages(documentId, assetId, session.user.id, pages);
    if (!stored) return new NextResponse("Not found", { status: 404 });
  } catch (error) {
    console.error("Document text extraction failure", error);
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown extraction error";
    await markDocumentExtractionError(documentId, assetId, session.user.id, message);
    const failure = new URL(`/assets/${encodeURIComponent(assetId)}`, request.url);
    failure.searchParams.set("documentError", "Text extraction failed. The original PDF is unchanged.");
    failure.hash = "documents";
    return NextResponse.redirect(failure, 303);
  }

  return NextResponse.redirect(new URL(`/assets/${encodeURIComponent(assetId)}#documents`, request.url), 303);
}
