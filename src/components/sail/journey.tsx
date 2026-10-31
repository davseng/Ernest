import Link from "next/link";
import Image from "next/image";
import type { PublicSailPosition } from "@/data/sail-position-store";
import type { PublicVoyage } from "@/data/sail-store";
import { positionDateLabel } from "@/domain/sail-position";
import { SailPositionMap } from "@/components/sail/position-map";
export function SailJourney({
  position: p,
  voyages,
}: {
  position: PublicSailPosition | null;
  voyages: PublicVoyage[];
}) {
  if (!p) return null;
  return (
    <section className="sail-story-section sail-journey">
      <div className="sail-section-heading">
        <div>
          <p className="sail-kicker">A note from the boat</p>
          <h2>Where’s {p.assetName}?</h2>
        </div>
        <p>This is my last update, not a live tracker.</p>
      </div>
      <div className="sail-journey-grid">
        <div className="sail-report">
          <span className="sail-kicker">Last reported position</span>
          <h3>{p.placeLabel}</h3>
          <p className="sail-report-date">
            Reported {positionDateLabel(p.reportedOn)}
          </p>
          {p.note ? <p className="sail-prose">{p.note}</p> : null}
          {p.latitude != null && p.longitude != null ? (
            <SailPositionMap
              latitude={p.latitude}
              longitude={p.longitude}
              placeLabel={p.placeLabel}
            />
          ) : null}
          {p.photoId ? (
            <figure className="sail-report-photo">
              <Image
                unoptimized
                src={`/sail/media/${p.photoId}`}
                alt={
                  p.photoAlt ?? p.photoCaption ?? "A photograph from the boat"
                }
                width={p.photoWidth ?? 1200}
                height={p.photoHeight ?? 800}
              />
              <figcaption>{p.photoCaption}</figcaption>
            </figure>
          ) : null}
        </div>
        <aside className="sail-next-plans">
          <p className="sail-kicker">And what’s next?</p>
          <h3>The plans, so far.</h3>
          {voyages
            .filter((v) => !["completed", "cancelled"].includes(v.status))
            .slice(0, 3)
            .map((v) => (
              <Link key={v.id} href={`/sail/voyages/${v.id}`}>
                <strong>{v.title}</strong>
                <span>
                  {v.departurePort} → {v.arrivalPort}
                </span>
              </Link>
            ))}
          <p>
            Weather and boat jobs sometimes have the last word. We’ll work out
            changes together.
          </p>
        </aside>
      </div>
    </section>
  );
}
