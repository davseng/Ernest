import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildAssetExport } from "@/data/asset-export";

export const dynamic = "force-dynamic";

function safeFilename(value: unknown) {
  return String(value ?? "asset").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "asset";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const snapshot = await buildAssetExport(id, session.user.id);
  if (!snapshot) notFound();

  const asset = snapshot.asset as { name?: unknown };
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${safeFilename(asset.name)}-Ernest-backup-${date}.json`;
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
