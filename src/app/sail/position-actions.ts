"use server";
import { scheduleSailNotifications } from "@/data/sail-notifications";
import { auth } from "@/auth";
import { sailPosition } from "@/data/sail-position";
import { revalidatePath } from "next/cache";
export async function saveSailPosition(
  assetId: string,
  input: unknown,
  revision: number,
) {
  const session = await auth();
  if (!session?.user?.id)
    return { ok: false as const, error: "Please sign in again." };
  try {
    const revisionSaved = await sailPosition().save(
      session.user.id,
      assetId,
      input,
      revision,
    );
    scheduleSailNotifications();
    revalidatePath("/sail");
    revalidatePath("/sail/manage/position");
    return {
      ok: true as const,
      revision: revisionSaved,
      message: "Position report saved.",
    };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof Error && e.name === "SailPositionError"
          ? e.message
          : "The report could not be saved. Reload and try again.",
    };
  }
}
