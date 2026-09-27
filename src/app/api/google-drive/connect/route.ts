import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { googleDriveAuthorizationUrl, googleDriveConfigured } from "@/data/google-drive";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/sign-in", request.url));
  const assetId = request.nextUrl.searchParams.get("asset");
  if (!assetId) return new NextResponse("Missing asset.", { status: 400 });
  if (!googleDriveConfigured()) return NextResponse.redirect(new URL(`/assets/${encodeURIComponent(assetId)}/documents?drive=not-configured`, request.url));

  const nonce = randomBytes(24).toString("hex");
  const state = `${nonce}:${assetId}`;
  const response = NextResponse.redirect(googleDriveAuthorizationUrl(state));
  response.cookies.set("ernest-drive-oauth-state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return response;
}
