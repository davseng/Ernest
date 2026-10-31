import Link from "next/link";
import { sailOwnerContext } from "../context";
import { sailPosition } from "@/data/sail-position";
import { sailPhotos } from "@/data/sail-photos";
import { sail } from "@/data/sail";
import { SailPositionForm } from "@/components/sail/position-form";
export const dynamic = "force-dynamic";
export default async function PositionPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  const { session, assets } = await sailOwnerContext(),
    query = await searchParams,
    asset = assets.find((a) => a.id === query.asset) ?? assets[0],
    ready = await sailPosition().available();
  const positions = ready
    ? await sailPosition().ownerList(session.user.id)
    : [];
  const current = positions.find((p) => p.assetId === asset.id) ?? null;
  const photoReady = await sailPhotos().available(),
    all = photoReady ? await sailPhotos().list(session.user.id) : [],
    voyages = await sail().ownerList(session.user.id);
  const publishedVoyages = new Set(
    voyages.filter((v) => v.published).map((v) => v.id),
  );
  const photos = all.filter(
    (p) =>
      p.assetId === asset.id &&
      p.ready &&
      p.published &&
      (!p.voyageId || publishedVoyages.has(p.voyageId)),
  );
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <p className="sail-kicker">
        <Link href="/sail/manage">← Owner workspace</Link>
      </p>
      <h1>Where’s {asset.name}?</h1>
      <p>
        A place, a date and a few words. Friends and family will see this as
        your last report.
      </p>
      {assets.length > 1 ? (
        <nav aria-label="Choose vessel" className="sail-actions">
          {assets.map((a) => (
            <Link
              key={a.id}
              href={`/sail/manage/position?asset=${encodeURIComponent(a.id)}`}
            >
              {a.name}
            </Link>
          ))}
        </nav>
      ) : null}
      {ready ? (
        <SailPositionForm
          key={asset.id}
          assetId={asset.id}
          initial={current}
          photos={photos.map((p) => ({ id: p.id, caption: p.caption }))}
        />
      ) : (
        <p className="sail-notice">
          Position updates need the isolated database setup first. The boat and
          joining pages are ready to use.
        </p>
      )}
    </main>
  );
}
