import { sailPhotos } from "@/data/sail-photos";
import { readDocument } from "@/data/document-storage";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  if (!(await sailPhotos().available()))
    return new Response("Not found", { status: 404 });
  const p = await sailPhotos().published(photoId);
  if (!p)
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  try {
    const bytes = await readDocument(p.storageKey);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response("Photo temporarily unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
