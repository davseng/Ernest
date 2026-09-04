"use server";

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { createComponent, createSystem, deleteComponent, deleteSystem, updateComponent, updateSystem } from "@/data/assets";
import { InputError, parseComponentDetails, parseSystemDetails } from "@/domain/asset-input";

function destination(assetId: string, error?: string) {
  const base = `/assets/${encodeURIComponent(assetId)}`;
  return error ? `${base}?error=${encodeURIComponent(error)}#inventory` : `${base}#inventory`;
}
function errorMessage(error: unknown) { return error instanceof InputError ? error.message : "Something went wrong. Please try again."; }
async function owner() { const session = await auth(); if (!session?.user?.id) redirect("/sign-in"); return session.user.id; }

export async function addSystem(assetId: string, formData: FormData) {
  const ownerId = await owner(); let created = false;
  try { created = await createSystem(assetId, ownerId, parseSystemDetails(formData)); }
  catch (error) { redirect(destination(assetId, errorMessage(error))); }
  if (!created) notFound(); redirect(destination(assetId));
}
export async function editSystem(assetId: string, systemId: string, formData: FormData) {
  const ownerId = await owner(); let updated = false;
  try { updated = await updateSystem(assetId, systemId, ownerId, parseSystemDetails(formData)); }
  catch (error) { redirect(destination(assetId, errorMessage(error))); }
  if (!updated) notFound(); redirect(destination(assetId));
}
export async function removeSystem(assetId: string, systemId: string) {
  if (!await deleteSystem(assetId, systemId, await owner())) notFound(); redirect(destination(assetId));
}
export async function addComponent(assetId: string, systemId: string, formData: FormData) {
  const ownerId = await owner(); let created = false;
  try { created = await createComponent(assetId, systemId, ownerId, parseComponentDetails(formData)); }
  catch (error) { redirect(destination(assetId, errorMessage(error))); }
  if (!created) notFound(); redirect(destination(assetId));
}
export async function editComponent(assetId: string, systemId: string, componentId: string, formData: FormData) {
  const ownerId = await owner(); let updated = false;
  try { updated = await updateComponent(assetId, systemId, componentId, ownerId, parseComponentDetails(formData)); }
  catch (error) { redirect(destination(assetId, errorMessage(error))); }
  if (!updated) notFound(); redirect(destination(assetId));
}
export async function removeComponent(assetId: string, systemId: string, componentId: string) {
  if (!await deleteComponent(assetId, systemId, componentId, await owner())) notFound(); redirect(destination(assetId));
}
