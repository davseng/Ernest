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

  const form = await request.formData();
  const visualStart=Number(form.get("visualStart")??1);
  if(!Number.isInteger(visualStart)||visualStart<1)return new NextResponse("Invalid visual start page",{status:400});
  const result = await processDocument(documentId, assetId, session.user.id, form.get("visual")==="true",visualStart);
  if (!result.ok && result.notFound) return new NextResponse("Not found", { status: 404 });

  return NextResponse.redirect(
    new URL(`/assets/${encodeURIComponent(assetId)}/documents/${encodeURIComponent(documentId)}`, request.url),
    303,
  );
}
