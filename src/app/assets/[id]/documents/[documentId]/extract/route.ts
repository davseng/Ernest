import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { processDocument } from "@/data/document-extraction";

export async function POST(request: Request, context: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id: assetId, documentId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/sign-in", request.url), 303);
  }

  const result = await processDocument(documentId, assetId, session.user.id);
  if (!result.ok && result.notFound) return new NextResponse("Not found", { status: 404 });

  return NextResponse.redirect(
    new URL(`/assets/${encodeURIComponent(assetId)}/documents/${encodeURIComponent(documentId)}`, request.url),
    303,
  );
}
