import { auth } from "@/auth";
import { getAssets } from "@/data/assets";
import { sail } from "@/data/sail";
import { redirect, notFound } from "next/navigation";
export async function sailOwnerContext() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sail/sign-in");
  const assets = await getAssets(session.user.id);
  if (!assets.length) notFound();
  return { session, assets, ready: await sail().available() };
}
