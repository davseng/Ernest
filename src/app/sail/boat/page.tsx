import Link from "next/link";
import { sailPhotos } from "@/data/sail-photos";
import { sailPhotoCategories } from "@/domain/sail-photos";
import { SailPhotoGallery } from "@/components/sail/photo-gallery";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "The Boat",
  description:
    "Step aboard: exterior, cockpit, salon, galley and berths in photographs.",
};
export default async function SailBoatPage() {
  let ready = false;
  try {
    ready = await sailPhotos().available();
  } catch {}
  const photos = ready ? await sailPhotos().publicPhotos() : [];
  return (
    <main id="sail-main" className="sail-main">
      <p className="sail-kicker">Life aboard</p>
      <h1>Get to know the boat.</h1>
      <p className="sail-boat-intro">
        Explore the spaces aboard, from the cockpit to the cabins. Ask the
        skipper about berth availability and arrangements for your voyage.
      </p>
      {photos.length ? (
        Object.entries(sailPhotoCategories).map(([category, label]) => {
          const group = photos.filter((p) => p.category === category);
          return group.length ? (
            <section className="sail-section" key={category}>
              <h2>{label}</h2>
              <SailPhotoGallery photos={group} />
            </section>
          ) : null;
        })
      ) : (
        <div className="sail-empty">
          <h2>A closer look is on its way.</h2>
          <p>
            Boat photographs will appear here after the owner publishes them.
          </p>
        </div>
      )}
      <section className="sail-section">
        <h2>See where we’re heading.</h2>
        <Link href="/sail#voyages" className="sail-button">
          Explore voyages →
        </Link>
      </section>
    </main>
  );
}
