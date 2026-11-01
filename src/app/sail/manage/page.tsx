import Link from "next/link";
import { sailOwnerContext } from "./context";
import { sail } from "@/data/sail";
import { departureLabel } from "@/domain/sail";
export const dynamic = "force-dynamic";
export default async function SailManagePage() {
  const { session, ready } = await sailOwnerContext();
  const voyages = ready ? await sail().ownerList(session.user.id) : [];
  return (
    <main id="sail-main" className="sail-main">
      <div className="sail-section-heading">
        <div>
          <p className="sail-kicker">Owner workspace</p>
          <h1>Your voyages</h1>
        </div>
        <div className="sail-actions">
          <Link href="/">Open Ernest</Link>
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
        <div className="sail-cards">
          {voyages.map((v) => (
            <article className="sail-card" key={v.id}>
              <p className="sail-kicker">
                {v.published ? "Public" : "Private draft"} · {v.status}
              </p>
              <h2>
                <Link href={`/sail/manage/${v.id}`}>{v.title}</Link>
              </h2>
              <p>
                {v.departurePort || "Departure open"} →{" "}
                {v.arrivalPort || "Destination open"}
              </p>
              <p>{departureLabel(v.departureFrom, v.departureTo)}</p>
              <Link className="sail-text-link" href={`/sail/manage/${v.id}`}>
                Manage voyage →
              </Link>
            </article>
          ))}
        </div>
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
