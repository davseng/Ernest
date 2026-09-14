import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildOfflineAssetPackage } from "@/data/offline-export";

export const dynamic = "force-dynamic";

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
    return Response.json({
      status: "current",
      sync,
      package: null,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return Response.json({
    status: "update",
    sync,
    package: offlinePackage,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
