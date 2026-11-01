import Link from "next/link";
import { notFound } from "next/navigation";
import { sailOwnerContext } from "../context";
import { sail } from "@/data/sail";
import { sailTimeline } from "@/data/sail-timeline";
import { SailWorkspace } from "@/components/sail/workspace";
export const dynamic = "force-dynamic";
export default async function ManageSailVoyage({
  params,
}: {
  params: Promise<{ voyageId: string }>;
}) {
  const { session, assets, ready } = await sailOwnerContext();
  if (!ready) notFound();
  const { voyageId } = await params,
    v = await sail().ownerVoyage(voyageId, session.user.id);
  if (!v) notFound();
  const [people, enquiries] = await Promise.all([
    sail().participants(v.id, session.user.id),
    sail().enquiries(v.id, session.user.id),
  ]);
  let availabilityReady = false,
    availability = null;
  try {
    availabilityReady = await sailTimeline().available();
    if (availabilityReady)
      availability =
        (await sailTimeline().ownerAvailability(session.user.id)).find(
          (a) => a.voyageId === v.id,
        ) ?? null;
  } catch {}
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <p className="sail-kicker">
        <Link href="/sail/manage">← Your voyages</Link> · {v.assetName}
      </p>
      <div className="sail-section-heading">
        <h1>{v.title}</h1>
        {v.published ? (
          <Link href={`/sail/voyages/${v.id}`}>View public page ↗</Link>
        ) : null}
      </div>
      <SailWorkspace
        availabilityReady={availabilityReady}
        availability={availability}
        voyage={v}
        assets={assets.map((a) => ({ id: a.id, name: a.name }))}
        people={people.map((p) => ({ ...p, lastSentAt: null }))}
        enquiries={enquiries.map((e) => ({ ...e }))}
      />
    </main>
  );
}
