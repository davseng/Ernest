import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAsset } from "@/data/assets";
import { processDocument } from "@/data/document-extraction";
import { getNextUnprocessedDocumentForAsset } from "@/data/documents";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: assetId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const asset = await getAsset(assetId, session.user.id);
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

  const document = await getNextUnprocessedDocumentForAsset(assetId, session.user.id);
  if (!document) return NextResponse.json({ done: true });

  const result = await processDocument(document.id, assetId, session.user.id);
  return NextResponse.json({
    done: false,
    documentId: document.id,
    title: document.title,
    ok: result.ok,
    message: result.ok ? `Processed ${document.title}` : `Could not process ${document.title}`,
  });
}
