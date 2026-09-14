import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildOfflineAssetPackage } from "@/data/offline-export";
import { persistOfflineLogBatchForOwner, type OfflineLogUploadBatch } from "@/data/offline-log-sync";

export const dynamic = "force-dynamic";

function noStore(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...init.headers, "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const offlinePackage = await buildOfflineAssetPackage(id, session.user.id);
  if (!offlinePackage) notFound();

  const url = new URL(request.url);
  const localRevision = url.searchParams.get("revision");
  const sync = offlinePackage.sync;

  if (localRevision && sync?.packageRevision && localRevision === sync.packageRevision) {
    return noStore({ status: "current", sync, package: null });
  }

  return noStore({ status: "update", sync, package: offlinePackage });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  // The write contract is intentionally deployable before the write capability is enabled.
  // Preview and production share the database, so this flag must remain off until the
  // Boat→Cloud authentication/write path is explicitly approved for activation.
  if (process.env.ERNEST_OFFLINE_LOG_UPLOAD_ENABLED !== "true") {
    return noStore({
      ok: false,
      uploadEnabled: false,
      error: "Boat-to-Cloud operating-log upload is not enabled.",
    }, { status: 503 });
  }

  try {
    const body = await request.json() as OfflineLogUploadBatch;
    const result = await persistOfflineLogBatchForOwner(body, id, session.user.id);
    return noStore({ ok: true, uploadEnabled: true, ...result });
  } catch (error) {
    return noStore({ ok: false, uploadEnabled: true, error: error instanceof Error ? error.message : "Offline log upload failed." }, { status: 400 });
  }
}
