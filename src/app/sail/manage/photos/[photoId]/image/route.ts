import { auth } from "@/auth";
import { sailPhotos } from "@/data/sail-photos";
import { readDocument } from "@/data/document-storage";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Not found", { status: 404 });
  const { photoId } = await params;
  const p = await sailPhotos().owned(photoId, session.user.id);
  if (!p?.ready) return new Response("Not found", { status: 404 });
  try {
    return new Response(Buffer.from(await readDocument(p.storageKey)), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response("Photo temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
