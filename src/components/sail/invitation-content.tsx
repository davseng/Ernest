import type { GuestInvitation } from "@/data/sail-store";
import { SailVoyageOverview } from "@/components/sail/voyage-overview";
import { SailGuestResponse } from "@/components/sail/guest-response";
export function SailInvitationContent({
  guest,
  token,
  contactHref,
}: {
  guest: GuestInvitation;
  token: string;
  contactHref?: string | null;
}) {
  const { participant: p, voyage: v } = guest;
  const changed = p.status === "accepted" && p.acceptedRevision !== v.revision;
  const closed = ["completed", "cancelled"].includes(v.status);
  return (
    <>
      <p className="sail-kicker">
        Your personal invitation · {p.role === "crew" ? "Crew" : "Passenger"}
      </p>
      <h1>
        {closed
          ? `This trip is ${v.status}.`
          : changed
            ? `Let’s check the updated plan, ${p.fullName}.`
            : p.status === "accepted"
              ? `You’re coming aboard, ${p.fullName}.`
              : p.status === "declined"
                ? `Maybe next time, ${p.fullName}.`
                : `You’re invited aboard, ${p.fullName}.`}
      </h1>
      <p>
        {closed
          ? "You can still read the trip details here, but responses are closed."
          : changed
            ? "You said yes to an earlier version. Check what’s changed below, then let me know if the new plan still works."
            : p.status === "accepted"
              ? "Your yes is saved. Here are the current plan and your joining details. Keep this link to check back before you travel."
              : p.status === "declined"
                ? "Your response is saved. If things change, you can return here and update it while the trip is open."
                : "This invitation is for you. Read the plan and what to expect, then let me know whether you can come. No account or extra sign-in needed."}
      </p>
      {!closed ? (
        <p>
          <a href="#your-response">
            {changed
              ? "Review and confirm the new plan"
              : p.status === "invited"
                ? "Read the details and respond"
                : "View or change your response"}{" "}
            ↓
          </a>
        </p>
      ) : null}
      {changed ? (
        <section className="sail-notice" aria-label="Updated plan">
          <h2>What’s changed</h2>
          {guest.changes?.length ? (
            <ul>
              {guest.changes.map((label) => (
                <li key={label}>{label} has been updated.</li>
              ))}
            </ul>
          ) : (
            <p>
              The plan has been updated. Read the current details below before
              confirming again.
            </p>
          )}
        </section>
      ) : null}
      <section className="sail-section" aria-label="Trip summary">
        <SailVoyageOverview voyage={v} headingLevel={2} />
      </section>
      <section className="sail-section">
        <h2>What to expect as {p.role === "crew" ? "crew" : "a passenger"}</h2>
        <p className="sail-prose">
          {guest.expectations ||
            "We’ll talk through preparations, responsibilities and what to bring before the trip."}
        </p>
        <h2>Joining details</h2>
        <p className="sail-prose">
          {guest.boardingNotes ||
            "We’ll sort out where to meet and what to bring together. Check this link again before making travel arrangements."}
        </p>
      </section>
      <section id="your-response" className="sail-section">
        <h2>Your response</h2>
        <SailGuestResponse
          key={`${p.revision}:${v.revision}`}
          token={token}
          voyageRevision={v.revision}
          participantRevision={p.revision}
          closed={closed}
          initialStatus={p.status}
          needsReconfirmation={changed}
        />
      </section>
      <section className="sail-inset">
        <h2>Have a question first?</h2>
        <p>
          You don’t have to decide straight away. Let’s talk through anything
          you’re unsure about.
        </p>
        {contactHref ? (
          <a className="sail-button" href={contactHref}>
            I have a question
          </a>
        ) : (
          <p>
            Message the person who sent you this invitation, then come back here
            when you’re ready to respond.
          </p>
        )}
      </section>
      <p className="sail-footnote">
        Keep this personal link private. It opens only your invitation, expires
        after 30 days and gives no access to Ernest. If it stops working, ask me
        for a fresh one.
      </p>
    </>
  );
}
