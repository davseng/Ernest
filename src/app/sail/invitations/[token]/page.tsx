import type { Metadata } from "next";
import { sail } from "@/data/sail";
import { SailVoyageOverview } from "@/components/sail/voyage-overview";
import { SailGuestResponse } from "@/components/sail/guest-response";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your private invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function SailInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const guest = await sail().guest(token);
  if (!guest)
    return (
      <main id="sail-main" className="sail-main sail-narrow">
        <h1>This invitation is unavailable.</h1>
        <p>
          It may have expired, been replaced or been cancelled. Ask the skipper
          for a fresh invitation.
        </p>
      </main>
    );
  const { participant: p, voyage: v } = guest,
    changed = p.status === "accepted" && p.acceptedRevision !== v.revision;
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <p className="sail-kicker">
        Your invitation · {p.role === "crew" ? "Crew" : "Passenger"}
      </p>
      <p>Hello {p.fullName}.</p>
      <SailVoyageOverview voyage={v} />
      {changed ? (
        <p className="sail-notice" role="status">
          The plan has changed since you accepted. Review the current details
          and confirm again when you are ready.
        </p>
      ) : (
        <p className="sail-notice">
          Your response:{" "}
          {p.status === "invited" ? "not yet received" : p.status}.
        </p>
      )}
      <section className="sail-section">
        <h2>What to expect as {p.role === "crew" ? "crew" : "a passenger"}</h2>
        <p className="sail-prose">
          {guest.expectations ||
            "Ask the skipper about preparations, responsibilities and what to bring."}
        </p>
        {guest.boardingNotes ? (
          <>
            <h2>Joining details</h2>
            <p className="sail-prose">{guest.boardingNotes}</p>
          </>
        ) : null}
      </section>
      <SailGuestResponse
        token={token}
        voyageRevision={v.revision}
        participantRevision={p.revision}
        closed={["completed", "cancelled"].includes(v.status)}
      />
      <p className="sail-footnote">
        This personal link gives access only to this invitation. Keep it
        private.
      </p>
    </main>
  );
}
