"use server";

import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { createLogEntry } from "@/data/log-entries";
import { logEntryTypes, type LogEntryType } from "@/domain/log-entries";

function optionalCoordinate(value: FormDataEntryValue | null, minimum: number, maximum: number) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) throw new Error("Invalid coordinate");
  return coordinate;
}

export async function addLogEntry(assetId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const occurredAt = new Date(String(formData.get("occurredAt") ?? ""));
  const entryType = String(formData.get("entryType") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (Number.isNaN(occurredAt.getTime()) || !logEntryTypes.includes(entryType as LogEntryType) || !title || !body) {
    throw new Error("Occurred at, entry type, title, and body are required");
  }

  const created = await createLogEntry(assetId, session.user.id, {
    occurredAt, entryType: entryType as LogEntryType, title, body,
    latitude: optionalCoordinate(formData.get("latitude"), -90, 90),
    longitude: optionalCoordinate(formData.get("longitude"), -180, 180),
  });
  if (!created) notFound();
  redirect(`/assets/${encodeURIComponent(assetId)}`);
}
