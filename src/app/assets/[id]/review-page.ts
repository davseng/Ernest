import { auth } from "@/auth";
import { getAsset } from "@/data/assets";
import { reviews } from "@/data/reviews";
import { notFound, redirect } from "next/navigation";
export async function reviewPageContext(assetId: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(assetId, session.user.id);
  if (!asset) notFound();
  return { session, asset, ready: await reviews().available() };
}
