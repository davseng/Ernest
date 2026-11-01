import Link from "next/link";
import { sailOwnerContext } from "../context";
import { sail } from "@/data/sail";
import { sailTimeline } from "@/data/sail-timeline";
import { SailCrewTable } from "@/components/sail/crew-table";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Crew & spaces",
  robots: { index: false, follow: false },
};
export default async function CrewPage() {
  const { session, ready } = await sailOwnerContext();
  const voyages = ready ? await sail().ownerList(session.user.id) : [];
  let availability: Awaited<
    ReturnType<ReturnType<typeof sailTimeline>["ownerAvailability"]>
  >[number][] = [];
  let people: Awaited<
    ReturnType<ReturnType<typeof sailTimeline>["roster"]>
  >[number][] = [];
  if (ready) {
    people = await sailTimeline().roster(session.user.id);
    if (await sailTimeline().available())
      availability = await sailTimeline().ownerAvailability(session.user.id);
  }
  return (
    <main id="sail-main" className="sail-main">
      <p>
        <Link href="/sail/manage">← Trip timeline</Link>
      </p>
      <div className="sail-section-heading">
        <div>
          <p className="sail-kicker">Who’s aboard, and where I need a hand</p>
          <h1>Crew &amp; spaces</h1>
        </div>
        <Link className="sail-button" href="/sail/manage/new">
          Plan a trip
        </Link>
      </div>
      <p>
        Confirmed names are people who’ve accepted the current plan. People who
        need to reconfirm are listed separately.
      </p>
      <p className="sail-footnote">
        Open places are the remaining numbers you’ve entered, not totals
        calculated from invitations. “Ask me” means you haven’t set a number.
        The crew list shows invited guests, not an assumed skipper.
      </p>
      <SailCrewTable
        voyages={voyages}
        availability={availability}
        people={people}
      />
    </main>
  );
}
