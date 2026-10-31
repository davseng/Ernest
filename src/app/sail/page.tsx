import Link from "next/link";
import Image from "next/image";
import { sailPhotos } from "@/data/sail-photos";
import { sail } from "@/data/sail";
import { sailPosition } from "@/data/sail-position";
import { SailJourney } from "@/components/sail/journey";
import { departureLabel } from "@/domain/sail";
export const dynamic = "force-dynamic";
export default async function SailHomePage() {
  let ready = false;
  try {
    ready = await sail().available();
  } catch {
    /* No services configured is a setup state, never sample live content. */
  }
  const voyages = ready ? await sail().publicList() : [];
  let photoReady = false;
  try {
    photoReady = await sailPhotos().available();
  } catch {}
  const photos = photoReady ? await sailPhotos().publicPhotos() : [],
    covers = photoReady ? await sailPhotos().publicCovers() : [];
  const hero = photos.find((p) => p.homeCover);
  let position = null;
  try {
    if (await sailPosition().available())
      position = await sailPosition().publicLatest();
  } catch {}
  return (
    <main id="sail-main" className="sail-main">
      <section className="sail-hero">
        <div>
          <p className="sail-kicker">Sail Far Better</p>
          <h1>
            Come sailing
            <br />
            with me.
          </h1>
          <p>
            I’m putting the plans here so it’s easier for friends and family to
            join me. Take a look at the boat, see what’s coming up, and let’s
            figure out a trip together.
          </p>
          <Link className="sail-button" href="#voyages">
            See the plans <span aria-hidden="true">↗</span>
          </Link>
        </div>
        {hero ? (
          <figure className="sail-home-photo">
            <Image
              unoptimized
              src={`/sail/media/${hero.id}`}
              alt={hero.altText}
              width={hero.width ?? 1600}
              height={hero.height ?? 1000}
              priority
            />
            <figcaption>{hero.caption}</figcaption>
          </figure>
        ) : (
          <div className="sail-horizon" aria-hidden="true">
            <span>A bit of time on the water.</span>
          </div>
        )}
      </section>
      <SailJourney position={position} voyages={voyages} />
      <section id="voyages" className="sail-section">
        <div className="sail-section-heading">
          <div>
            <p className="sail-kicker">What I’m thinking about next</p>
            <h2>Voyages</h2>
          </div>
          <p>
            These are the plans so far. Weather and boat jobs can move things
            around—we’ll keep talking.
          </p>
        </div>
        {voyages.length ? (
          <div className="sail-cards">
            {voyages.map((v) => (
              <article key={v.id} className="sail-card">
                {covers
                  .filter((p) => p.voyageId === v.id)
                  .slice(0, 1)
                  .map((p) => (
                    <Link
                      href={`/sail/voyages/${v.id}`}
                      key={p.id}
                      className="sail-voyage-photo"
                    >
                      <Image
                        unoptimized
                        src={`/sail/media/${p.id}`}
                        alt={p.altText}
                        width={p.width ?? 1200}
                        height={p.height ?? 800}
                      />
                    </Link>
                  ))}
                <div className="sail-kicker">
                  {v.assetName}
                  <span className="sail-pill">
                    {v.status === "ready" ? "Ready to go" : v.status}
                  </span>
                </div>
                <h3>
                  <Link href={`/sail/voyages/${v.id}`}>{v.title}</Link>
                </h3>
                <p>
                  {v.departurePort} → {v.arrivalPort}
                </p>
                <strong>
                  {departureLabel(v.departureFrom, v.departureTo)}
                </strong>
                {v.timingNote ? <p>{v.timingNote}</p> : null}
                <Link href={`/sail/voyages/${v.id}`} className="sail-text-link">
                  Have a look →
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="sail-empty">
            <h3>
              {ready
                ? "I’m working out the next trip."
                : "The plans are on their way."}
            </h3>
            <p>
              {ready
                ? "I’ll put the plans here when they’re ready to share."
                : "I’ll put the next trips here as things take shape."}
            </p>
          </div>
        )}
      </section>
      <section className="sail-section sail-boat-teaser">
        <div>
          <p className="sail-kicker">Step aboard</p>
          <h2>Come and have a look around.</h2>
          <p>
            From the cockpit to the cabins: here’s the boat we’ll be spending
            time aboard.
          </p>
          <Link className="sail-text-link" href="/sail/boat">
            Meet Far Better →
          </Link>
        </div>
      </section>
      <section id="joining" className="sail-section">
        <p className="sail-kicker">Fancy coming along?</p>
        <h2>A bit of sailing. A bit of company.</h2>
        <div className="sail-cards">
          <article className="sail-card">
            <span className="sail-number">01 / Crew</span>
            <h3>Fancy helping with the sailing?</h3>
            <p>
              Tell me what you’ve done before and what you’d like to try. We’ll
              talk through how you’d like to take part.
              <Link className="sail-text-link" href="/sail/join#crew">
                Joining as crew →
              </Link>
            </p>
          </article>
          <article className="sail-card">
            <span className="sail-number">02 / Passenger</span>
            <h3>Coming along for the ride?</h3>
            <p>
              Have a look at life aboard and bring your questions. We’ll work
              through the practical bits together.
              <Link className="sail-text-link" href="/sail/join#passenger">
                Joining as a passenger →
              </Link>
            </p>
          </article>
        </div>
        <p className="sail-footnote">
          Not sure where to start?{" "}
          <Link href="/sail/join">Here’s how joining works.</Link> Already
          invited? Use the personal link in your email.
        </p>
      </section>
    </main>
  );
}
