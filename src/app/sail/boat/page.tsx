import Link from "next/link";
import { sailPhotos } from "@/data/sail-photos";
import { SailPhotoGallery } from "@/components/sail/photo-gallery";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "The Boat",
  description:
    "Come aboard Far Better: a look around the cockpit, galley, salon and berths.",
};
export default async function SailBoatPage() {
  let ready = false;
  try {
    ready = await sailPhotos().available();
  } catch {}
  const rows = ready ? await sailPhotos().publicPhotos() : [],
    photos = rows.map((p) => ({ ...p })),
    hero =
      photos.find(
        (p) => p.category === "exterior" && (p.height ?? 0) > (p.width ?? 0),
      ) ?? photos.find((p) => p.category === "exterior"),
    above = photos.filter(
      (p) =>
        p.category === "cockpit" ||
        (p.category === "exterior" && p.id !== hero?.id),
    ),
    below = photos.filter(
      (p) => p.category === "salon" || p.category === "galley",
    ),
    berths = photos.filter(
      (p) => p.category === "forward_berth" || p.category === "aft_berth",
    ),
    practical = photos.filter((p) => p.category === "forward_lav"),
    moments = photos.filter((p) => p.category === "sailing");
  return (
    <main id="sail-main" className="sail-main sail-story">
      <section className="sail-story-hero">
        <div>
          <p className="sail-kicker">A look around</p>
          <h1>
            Welcome aboard
            {photos[0]?.assetName ? (
              <>
                <br />
                {photos[0].assetName}.
              </>
            ) : (
              "."
            )}
          </h1>
          <p className="sail-story-lede">
            Here’s a look around, from the cockpit to the cabins. We’ll figure
            out where you’ll sleep and what to bring before you come.
          </p>
          <Link className="sail-button" href="/sail/join">
            Come along →
          </Link>
          <nav className="sail-story-jumps" aria-label="Look around the boat">
            {above.length ? <a href="#on-deck">On deck</a> : null}
            {below.length ? <a href="#below-deck">Below decks</a> : null}
            {berths.length ? <a href="#berths">Berths</a> : null}
          </nav>
        </div>
        {hero ? (
          <SailPhotoGallery
            photos={[hero]}
            allPhotos={photos}
            variant="portrait"
          />
        ) : null}
      </section>
      {!photos.length ? (
        <div className="sail-empty">
          <h2>The pictures are on their way.</h2>
          <p>I’ll put a look around the boat here as the photos are ready.</p>
        </div>
      ) : null}
      {above.length ? (
        <section id="on-deck" className="sail-story-section">
          <div className="sail-story-heading">
            <p className="sail-kicker">Up on deck</p>
            <h2>The cockpit.</h2>
            <p>
              A lot of a trip happens here: sailing, talking, and deciding it’s
              time for a snack.
            </p>
          </div>
          <SailPhotoGallery
            photos={above}
            allPhotos={photos}
            variant="collage"
          />
        </section>
      ) : null}
      {moments.length ? (
        <section className="sail-story-moment">
          <div>
            <p className="sail-kicker">Out on the water</p>
            <h2>Some of my favourite views.</h2>
          </div>
          <SailPhotoGallery
            photos={moments}
            allPhotos={photos}
            variant="collage"
          />
        </section>
      ) : null}
      {below.length ? (
        <section id="below-deck" className="sail-story-section">
          <div className="sail-story-heading">
            <p className="sail-kicker">Below decks</p>
            <h2>
              A meal, a chat,
              <br />
              and a place to sit.
            </h2>
            <p>
              The galley and salon give you an idea of everyday life aboard
              between the sailing.
            </p>
          </div>
          <SailPhotoGallery
            photos={below}
            allPhotos={photos}
            variant="collage"
          />
        </section>
      ) : null}
      {berths.length ? (
        <section id="berths" className="sail-story-section">
          <div className="sail-story-heading">
            <p className="sail-kicker">At the end of the day</p>
            <h2>Where you might sleep.</h2>
            <p>
              Here are the berths. I’ll agree sleeping arrangements with you
              before the trip.
            </p>
          </div>
          <SailPhotoGallery
            photos={berths}
            allPhotos={photos}
            variant="berths"
          />
        </section>
      ) : null}
      {practical.length ? (
        <section className="sail-story-section sail-story-practical">
          <div className="sail-story-heading">
            <p className="sail-kicker">The practical bits</p>
            <h2>Good to know before you pack.</h2>
            <p>
              We’ll talk through the everyday details before you come. Bring
              your questions.
            </p>
          </div>
          <SailPhotoGallery
            photos={practical}
            allPhotos={photos}
            variant="portrait"
          />
        </section>
      ) : null}
      <section className="sail-story-invite">
        <p className="sail-kicker">Fancy coming along?</p>
        <h2>Let’s work out a trip.</h2>
        <p>Have a look at the plans, then send me a note.</p>
        <div className="sail-actions">
          <Link href="/sail#voyages" className="sail-button">
            See the plans →
          </Link>
          <Link href="/sail/join">What’s joining like?</Link>
        </div>
      </section>
    </main>
  );
}
