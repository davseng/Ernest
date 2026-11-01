import Link from "next/link";
import { sail } from "@/data/sail";
import { sailPhotos } from "@/data/sail-photos";
import { sailTimeline } from "@/data/sail-timeline";
import { SailTripTimeline } from "@/components/sail/trip-timeline";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Trips ahead",
  description:
    "See the plans, find some time on the water, and let’s work out a trip together.",
};
export default async function Trips({
  searchParams,
}: {
  searchParams?: Promise<{ as?: string }>;
}) {
  const q = await searchParams,
    role = q?.as === "crew" || q?.as === "passenger" ? q.as : undefined;
  const ready = await sail().available(),
    voyages = ready ? await sail().publicList() : [];
  let availability: Awaited<
      ReturnType<ReturnType<typeof sailTimeline>["publicAvailability"]>
    >[number][] = [],
    covers: Awaited<
      ReturnType<ReturnType<typeof sailPhotos>["publicCovers"]>
    >[number][] = [];
  try {
    if (await sailTimeline().available())
      availability = await sailTimeline().publicAvailability();
  } catch {}
  try {
    if (await sailPhotos().available())
      covers = await sailPhotos().publicCovers();
  } catch {}
  return (
    <main id="sail-main" className="sail-main">
      <p className="sail-kicker">Some time on the water</p>
      <h1>Trips ahead.</h1>
      <p className="sail-story-lede">
        Here’s what I’m thinking about, in the order it might happen. Dates are
        plans, not promises. See something that suits? Send me a note.
      </p>
      <nav className="sail-trip-filters" aria-label="Find a trip">
        {[
          [undefined, "All trips"],
          ["crew", "Join as crew"],
          ["passenger", "Come as a passenger"],
        ].map(([value, label]) => (
          <Link
            key={label}
            href={value ? `/sail/trips?as=${value}` : "/sail/trips"}
            aria-current={role === value ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <p className="sail-footnote">
        Space is updated by me. “Ask me” means arrangements are still open;
        sending a note doesn’t reserve a place.
      </p>
      <SailTripTimeline
        voyages={voyages}
        availability={availability}
        covers={covers}
        role={role}
      />
    </main>
  );
}
