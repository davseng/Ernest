import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createDocumentReadUrl } from "@/data/document-storage";
import { getPhoto } from "@/data/photos";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/sign-in", _request.url));
  }

  const photo = await getPhoto(photoId, id, session.user.id);
  if (!photo) return new NextResponse("Not found", { status: 404 });

  const readUrl = await createDocumentReadUrl(photo.storageKey, photo.originalFilename);
  return NextResponse.redirect(readUrl);
}
