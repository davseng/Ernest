"use server";

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { createAsset, deleteAsset, updateAsset } from "@/data/assets";
import { InputError, parseAssetDetails } from "@/domain/asset-input";

function message(error: unknown) {
  return error instanceof InputError ? error.message : "Something went wrong. Please try again.";
}

export async function addAsset(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  let asset;
  try { asset = await createAsset(session.user.id, parseAssetDetails(formData)); }
  catch (error) { redirect(`/assets/new?error=${encodeURIComponent(message(error))}`); }
  redirect(`/assets/${asset.id}`);
}

export async function editAsset(assetId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  let updated = false;
  try { updated = await updateAsset(assetId, session.user.id, parseAssetDetails(formData)); }
  catch (error) { redirect(`/assets/${encodeURIComponent(assetId)}/edit?error=${encodeURIComponent(message(error))}`); }
  if (!updated) notFound();
  redirect(`/assets/${encodeURIComponent(assetId)}`);
}

export async function removeAsset(assetId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (!await deleteAsset(assetId, session.user.id)) notFound();
  redirect("/");
}
