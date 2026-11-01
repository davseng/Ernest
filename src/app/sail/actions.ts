"use server";
import { scheduleSailNotifications } from "@/data/sail-notifications";
import { auth } from "@/auth";
import { sailInvitationOrigin } from "@/data/sail-invitation-url";
import { sail } from "@/data/sail";
import { sailMailProblem, sendSailInvitation } from "@/data/sail-mail";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createHmac } from "node:crypto";
export type SailResult =
  | { ok: true; id?: string; message: string; invitationUrl?: string }
  | { ok: false; error: string };
function errorResult(error: unknown): SailResult {
  return {
    ok: false,
    error:
      error instanceof Error && !("code" in error)
        ? error.message
        : "That change could not be saved. Please reload and try again.",
  };
}
async function owner() {
  const session = await auth();
  if (!session?.user?.id) throw Error("Please sign in again.");
  return session.user.id;
}
function refresh(id?: string) {
  scheduleSailNotifications();
  revalidatePath("/sail");
  revalidatePath("/sail/manage");
  if (id) {
    revalidatePath(`/sail/manage/${id}`);
    revalidatePath(`/sail/voyages/${id}`);
  }
}
export async function saveSailVoyage(
  assetId: string,
  id: string | null,
  input: unknown,
  expectedRevision?: number,
  initialAvailability?: unknown,
): Promise<SailResult> {
  try {
    const saved = await sail().save(
      await owner(),
      assetId,
      id,
      input,
      expectedRevision,
      initialAvailability,
    );
    refresh(saved);
    return { ok: true, id: saved, message: "Voyage saved." };
  } catch (e) {
    return errorResult(e);
  }
}
export async function addSailPerson(
  voyageId: string,
  input: unknown,
): Promise<SailResult> {
  try {
    const id = await sail().addPerson(voyageId, await owner(), input);
    refresh(voyageId);
    return {
      ok: true,
      id,
      message:
        "Person added. Email their invitation or create a link to share.",
    };
  } catch (e) {
    return errorResult(e);
  }
}
export async function sendSailPerson(
  voyageId: string,
  participantId: string,
): Promise<SailResult> {
  let delivery: { hash: string; ownerId: string } | undefined;
  try {
    const ownerId = await owner(),
      store = sail();
    const person = (await store.participants(voyageId, ownerId)).find(
      (p) => p.id === participantId,
    );
    if (!person) throw Error("Invitation not found.");
    if (!person.email)
      throw Error("Add an email address or create a link to share yourself.");
    const problem = sailMailProblem(person.email);
    if (problem) throw Error(problem);
    const invitation = await store.issue(voyageId, ownerId, participantId);
    delivery = { hash: invitation.hash, ownerId };
    await sendSailInvitation({ ...invitation, email: person.email });
    await store.recordDelivery(
      voyageId,
      ownerId,
      participantId,
      invitation.hash,
      true,
    );
    refresh(voyageId);
    return {
      ok: true,
      message:
        "Invitation email accepted for delivery. Their response will appear here.",
    };
  } catch (e) {
    if (delivery) {
      try {
        await sail().recordDelivery(
          voyageId,
          delivery.ownerId,
          participantId,
          delivery.hash,
          false,
        );
      } catch {
        /* A pending state is never reported as sent. */
      }
      refresh(voyageId);
      return {
        ok: false,
        error:
          "No delivery was confirmed. Check the invitation status before retrying.",
      };
    }
    return errorResult(e);
  }
}
export async function createSailPersonLink(
  voyageId: string,
  participantId: string,
): Promise<SailResult> {
  try {
    const ownerId = await owner();
    const origin = sailInvitationOrigin();
    const invitation = await sail().issue(
      voyageId,
      ownerId,
      participantId,
      "link",
    );
    refresh(voyageId);
    return {
      ok: true,
      invitationUrl: `${origin}/sail/invitations/${invitation.token}`,
      message:
        "Personal link created. Copy it and send it directly to this person. No email was sent.",
    };
  } catch (e) {
    return errorResult(e);
  }
}
export async function updateSailPerson(
  voyageId: string,
  participantId: string,
  input: unknown,
  revision: number,
): Promise<SailResult> {
  try {
    await sail().updatePerson(
      voyageId,
      await owner(),
      participantId,
      input,
      revision,
    );
    refresh(voyageId);
    return {
      ok: true,
      message:
        "Person updated. Email or create a fresh invitation; the previous link no longer works.",
    };
  } catch (e) {
    return errorResult(e);
  }
}
export async function cancelSailPerson(
  voyageId: string,
  participantId: string,
  revision: number,
): Promise<SailResult> {
  try {
    await sail().cancelPerson(voyageId, await owner(), participantId, revision);
    refresh(voyageId);
    return {
      ok: true,
      message: "Invitation cancelled. Its link no longer works.",
    };
  } catch (e) {
    return errorResult(e);
  }
}
export async function respondToSailInvitation(
  token: string,
  status: "accepted" | "declined",
  voyageRevision: number,
  participantRevision: number,
): Promise<SailResult> {
  try {
    await sail().respond(token, status, voyageRevision, participantRevision);
    scheduleSailNotifications();
    return {
      ok: true,
      message:
        status === "accepted"
          ? "You have accepted the current plan."
          : "You have declined this invitation.",
    };
  } catch (e) {
    return errorResult(e);
  }
}
export async function submitSailInterest(
  voyageId: string,
  input: unknown,
): Promise<SailResult> {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw Error("The enquiry form is temporarily unavailable.");
    const h = await headers(),
      ip = (h.get("x-forwarded-for") ?? "unavailable")
        .split(",")[0]
        .trim()
        .slice(0, 200);
    const requesterHash = createHmac("sha256", secret)
      .update("sail-interest:" + ip)
      .digest("hex");
    await sail().interest(voyageId, input, requesterHash);
    scheduleSailNotifications();
    return {
      ok: true,
      message:
        "Your note has been received. I’ll get back to you to work out the details. This doesn’t reserve a place.",
    };
  } catch (e) {
    return errorResult(e);
  }
}
export async function reviewSailEnquiry(
  voyageId: string,
  id: string,
): Promise<SailResult> {
  try {
    await sail().reviewEnquiry(voyageId, await owner(), id);
    refresh(voyageId);
    return { ok: true, message: "Marked reviewed." };
  } catch (e) {
    return errorResult(e);
  }
}

export async function inviteSailEnquiry(
  voyageId: string,
  enquiryId: string,
): Promise<SailResult> {
  try {
    const person = await sail().inviteEnquiry(
      voyageId,
      await owner(),
      enquiryId,
    );
    refresh(voyageId);
    return {
      ok: true,
      id: person.id,
      message: person.existing
        ? "This person is already in People. Their invitation is unchanged; you can manage it there."
        : "Added to People with their preferred role. Email an invitation or create a personal link when you’re ready. Nothing has been sent yet.",
    };
  } catch (e) {
    return errorResult(e);
  }
}
