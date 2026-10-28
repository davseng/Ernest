"use server";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reviews } from "@/data/reviews";
export async function saveReview(
  assetId: string,
  reviewId: string,
  input: unknown,
  coverageConfirmed = false,
) {
  const session = await auth();
  if (!session?.user?.id)
    return { ok: false as const, error: "Please sign in again." };
  try {
    const receipt = await reviews().approve(
      assetId,
      session.user.id,
      reviewId,
      input,
      coverageConfirmed,
    );
    for (const p of [
      "/",
      "/assets/" + assetId + "/history",
      "/assets/" + assetId + "/survey",
      "/assets/" + assetId + "/summary",
      "/assets/" + assetId + "/inventory",
      "/assets/" + assetId + "/reviews/" + reviewId,
    ])
      revalidatePath(p);
    return { ok: true as const, receipt };
  } catch (error) {
    // Only user-facing validation errors are exposed; database/provider exceptions
    // can contain private values and must never be returned or logged verbatim.
    const message =
      error instanceof Error && !("code" in error)
        ? error.message
        : "The changes were not saved. The transaction was rolled back; please retry or request a refreshed form.";
    return { ok: false as const, error: message };
  }
}
export async function cancelReview(assetId: string, reviewId: string) {
  const session = await auth();
  if (!session?.user?.id)
    return { ok: false as const, error: "Please sign in again." };
  const ok = await reviews().cancel(assetId, session.user.id, reviewId);
  revalidatePath(`/assets/${assetId}/reviews/${reviewId}`);
  return { ok };
}
export async function prepareMaintenanceCorrection(
  assetId: string,
  eventId: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw Error("Please sign in again.");
  const event = (await reviews().events(assetId, session.user.id)).find(
    (e) => e.id === eventId,
  );
  if (!event) throw Error("Maintenance event not found.");
  const id = await reviews().create(
    assetId,
    session.user.id,
    `Owner requested correction of maintenance event ${eventId}`,
    {
      title: `Correct ${event.title}`,
      summary:
        "Edit the event, then approve the correction. Its previous version is retained.",
      missing: [],
      coverage: "",
      rows: [
        {
          id: "correction",
          include: true,
          kind: "maintenance",
          eventId: event.id,
          expectedRevision: event.revision,
          title: event.title,
          description: event.description,
          date: event.occurred_on,
          componentId: event.component_id,
          engineHours: event.engine_hours,
          spareItemId: event.spare_item_id,
          spareUsed: event.spare_used,
          deductSpare: false,
          allowDuplicate: false,
          evidence: event.evidence,
          reason: "Owner-requested correction.",
        },
      ],
    },
  );
  redirect(`/assets/${assetId}/reviews/${id}`);
}
export async function startBlankReview(assetId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw Error("Please sign in again.");
  const kind = String(formData.get("kind"));
  const base = {
    id: "manual",
    include: true,
    evidence: [],
    reason: "Entered directly by the owner.",
  };
  const row =
    kind === "inventory"
      ? { ...base, kind, itemId: "", quantity: null, details: null }
      : kind === "knowledge"
        ? { ...base, kind, subject: "", predicate: "", value: "", date: null }
        : {
            ...base,
            kind: "maintenance",
            eventId: null,
            title: "",
            description: "",
            date: null,
            componentId: null,
            engineHours: null,
            spareItemId: null,
            spareUsed: null,
            deductSpare: false,
            allowDuplicate: false,
          };
  const id = await reviews().create(
    assetId,
    session.user.id,
    "Owner opened a blank editable update form",
    {
      title: "Review your update",
      summary:
        "Enter the details you know. Optional unknowns can remain blank.",
      missing: [],
      coverage: "",
      rows: [row],
    },
  );
  redirect(`/assets/${assetId}/reviews/${id}`);
}
