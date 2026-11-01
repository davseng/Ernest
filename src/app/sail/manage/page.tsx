import Link from "next/link";
import { sailOwnerContext } from "./context";
import { sail } from "@/data/sail";
import { sailTimeline } from "@/data/sail-timeline";
import { SailTripTimeline } from "@/components/sail/trip-timeline";
export const dynamic = "force-dynamic";
export default async function SailManagePage() {
  const { session, ready } = await sailOwnerContext();
  const voyages = ready ? await sail().ownerList(session.user.id) : [];
  let availability: Awaited<
      ReturnType<ReturnType<typeof sailTimeline>["ownerAvailability"]>
    >[number][] = [],
    summaries: Awaited<
      ReturnType<ReturnType<typeof sailTimeline>["summary"]>
    >[number][] = [];
  try {
    if (await sailTimeline().available()) {
      availability = await sailTimeline().ownerAvailability(session.user.id);
      summaries = await sailTimeline().summary(session.user.id);
    }
  } catch {}
  return (
    <main id="sail-main" className="sail-main">
      <div className="sail-section-heading">
        <div>
          <p className="sail-kicker">Owner workspace</p>
          <h1>Your trips ahead</h1>
        </div>
        <div className="sail-actions">
          <Link href="/">Open Ernest</Link>
          <Link href="/sail/manage/notifications">Email updates</Link>
          <Link href="/sail/manage/photos">Website photos</Link>
          <Link href="/sail/manage/position">Position update</Link>
          {ready ? (
            <Link href="/sail/manage/new" className="sail-button">
              Plan a voyage
            </Link>
          ) : null}
        </div>
      </div>
      {!ready ? (
        <p className="sail-notice">
          Voyage setup is pending. The isolated database needs migration 027
          before planning can begin.
        </p>
      ) : voyages.length ? (
        <SailTripTimeline
          owner
          voyages={voyages}
          availability={availability}
          summaries={summaries}
        />
      ) : (
        <div className="sail-empty">
          <h2>Start with the next voyage.</h2>
          <p>
            A name, a route and a rough idea of timing are enough to begin. Keep
            it private until you are ready to share.
          </p>
        </div>
      )}
    </main>
  );
}
