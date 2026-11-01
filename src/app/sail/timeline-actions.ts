"use server";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { sailTimeline } from "@/data/sail-timeline";
import {
  sailNotifications,
  dispatchSailNotifications,
  scheduleSailNotifications,
} from "@/data/sail-notifications";
export async function saveSailAvailability(
  id: string,
  input: unknown,
  revision: number,
) {
  const session = await auth();
  if (!session?.user?.id)
    return { ok: false as const, error: "Please sign in again." };
  try {
    const saved = await sailTimeline().save(
      session.user.id,
      id,
      input,
      revision,
    );
    revalidatePath("/sail", "layout");
    scheduleSailNotifications();
    return { ok: true as const, revision: saved };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof Error && !("code" in e)
          ? e.message
          : "Availability could not be saved. Reload before retrying.",
    };
  }
}
export async function sendSailUpdates(retryFailed = false) {
  const session = await auth();
  if (!session?.user?.id)
    return { ok: false, message: "Please sign in again." };
  try {
    if (retryFailed) await sailNotifications().retryFailed(session.user.id);
    const result = await dispatchSailNotifications(session.user.id);
    revalidatePath("/sail/manage/notifications");
    return result;
  } catch {
    return {
      ok: false,
      message:
        "Delivery could not be confirmed. Check the queue before retrying.",
    };
  }
}
