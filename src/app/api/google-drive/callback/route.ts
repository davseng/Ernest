import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { getAsset } from "@/data/assets";
import { exchangeGoogleCode, saveGoogleDriveConnection } from "@/data/google-drive";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/sign-in", request.url));
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const expected = request.cookies.get("ernest-drive-oauth-state")?.value ?? "";
  const assetId = state.split(":").slice(1).join(":");
  if (!state || state !== expected || !assetId) return new NextResponse("Invalid or expired Google Drive connection request.", { status: 400 });
  const asset = await getAsset(assetId, session.user.id);
  if (!asset) return new NextResponse("Asset not found.", { status: 404 });
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL(`/assets/${encodeURIComponent(assetId)}/documents?drive=denied`, request.url));
  try {
    const token = await exchangeGoogleCode(code);
    await saveGoogleDriveConnection(session.user.id, token);
    const response = NextResponse.redirect(new URL(`/assets/${encodeURIComponent(assetId)}/documents?drive=connected`, request.url));
    response.cookies.delete("ernest-drive-oauth-state");
    return response;
  } catch (error) {
    console.error("Google Drive connection failed", error);
    return NextResponse.redirect(new URL(`/assets/${encodeURIComponent(assetId)}/documents?drive=error`, request.url));
  }
}
