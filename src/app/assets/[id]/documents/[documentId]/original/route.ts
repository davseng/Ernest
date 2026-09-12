import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createDocumentReadUrl } from "@/data/document-storage";
import { getDocumentForAsset } from "@/data/documents";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const { id, documentId } = await params;
  const document = await getDocumentForAsset(documentId, id, session.user.id);
  if (!document) return new NextResponse("Not found", { status: 404 });

  const signedUrl = await createDocumentReadUrl(document.storageKey, document.originalFilename);
  return NextResponse.redirect(signedUrl);
}
