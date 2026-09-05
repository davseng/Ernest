"use server";

import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { updateAsset } from "@/data/assets";
import { AssetInputError, parseAssetDetails } from "@/domain/asset-input";

function editDestination(assetId: string, error: string) {
  return `/assets/${encodeURIComponent(assetId)}/edit?error=${encodeURIComponent(error)}`;
}

export async function editAsset(assetId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  let updated = false;
  try {
    updated = await updateAsset(assetId, session.user.id, parseAssetDetails(formData));
  } catch (error) {
    const message = error instanceof AssetInputError
      ? error.message
      : "Something went wrong. Please try again.";
    redirect(editDestination(assetId, message));
  }

  if (!updated) notFound();
  redirect(`/assets/${encodeURIComponent(assetId)}`);
}
