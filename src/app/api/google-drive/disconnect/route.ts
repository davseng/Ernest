import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAsset } from "@/data/assets";
import { disconnectGoogleDrive } from "@/data/google-drive";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const assetId = request.nextUrl.searchParams.get("asset");
  if (!assetId) return NextResponse.json({ error: "Missing asset." }, { status: 400 });
  const asset = await getAsset(assetId, session.user.id);
  if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  await disconnectGoogleDrive(session.user.id);
  return NextResponse.redirect(new URL(`/assets/${encodeURIComponent(assetId)}/documents?drive=disconnected`, request.url), 303);
}
