"use server";

import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { createSystem, deleteSystem, updateSystem } from "@/data/assets";
import { AssetInputError, parseSystemDetails } from "@/domain/asset-input";

async function owner() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  return session.user.id;
}

function destination(assetId: string, error?: string) {
  const base = `/assets/${encodeURIComponent(assetId)}#inventory`;
  return error ? `${base}?error=${encodeURIComponent(error)}` : base;
}

function errorMessage(error: unknown) {
  return error instanceof AssetInputError ? error.message : "Something went wrong. Please try again.";
}

export async function addSystem(assetId: string, formData: FormData) {
  const ownerId = await owner();
  let created = false;
  try {
    created = await createSystem(assetId, ownerId, parseSystemDetails(formData));
  } catch (error) {
    redirect(destination(assetId, errorMessage(error)));
  }
  if (!created) notFound();
  redirect(destination(assetId));
}

export async function editSystem(assetId: string, systemId: string, formData: FormData) {
  const ownerId = await owner();
  let updated = false;
  try {
    updated = await updateSystem(assetId, systemId, ownerId, parseSystemDetails(formData));
  } catch (error) {
    redirect(destination(assetId, errorMessage(error)));
  }
  if (!updated) notFound();
  redirect(destination(assetId));
}

export async function removeSystem(assetId: string, systemId: string) {
  if (!await deleteSystem(assetId, systemId, await owner())) notFound();
  redirect(destination(assetId));
}
