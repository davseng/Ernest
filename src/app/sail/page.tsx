import Link from "next/link";
import { sail } from "@/data/sail";
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
  return (
    <main id="sail-main" className="sail-main">
      <section className="sail-hero">
        <div>
          <p className="sail-kicker">Sail Far Better</p>
          <h1>
            Good company.
            <br />
            An open horizon.
          </h1>
          <p>
            Explore the next voyage, find out what joining involves, and stay in
            step as the plan takes shape.
          </p>
          <Link className="sail-button" href="#voyages">
            Explore the voyages <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="sail-horizon" aria-hidden="true">
          <span>Room for the unexpected.</span>
        </div>
      </section>
      <section id="voyages" className="sail-section">
        <div className="sail-section-heading">
          <div>
            <p className="sail-kicker">The next chapter</p>
            <h2>Voyages</h2>
          </div>
          <p>
            Dates are a plan, not a promise. Weather and vessel readiness come
            first.
          </p>
        </div>
        {voyages.length ? (
          <div className="sail-cards">
            {voyages.map((v) => (
              <article key={v.id} className="sail-card">
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
                  See the plan →
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="sail-empty">
            <h3>
              {ready
                ? "The next voyage is taking shape."
                : "Voyage planning is getting ready."}
            </h3>
            <p>
              {ready
                ? "Published voyages will appear here."
                : "The public site will show voyages once setup is complete."}
            </p>
          </div>
        )}
      </section>
      <section id="joining" className="sail-section">
        <p className="sail-kicker">Find your place aboard</p>
        <h2>Two ways to join.</h2>
        <div className="sail-cards">
          <article className="sail-card">
            <span className="sail-number">01 / Crew</span>
            <h3>Be part of the sailing.</h3>
            <p>
              Share your experience and talk with the skipper about how you
              would like to contribute. Your invitation will explain what to
              expect for that voyage.
            </p>
          </article>
          <article className="sail-card">
            <span className="sail-number">02 / Passenger</span>
            <h3>Come along for the journey.</h3>
            <p>
              Ask about life aboard, the route and what to bring. Passenger
              invitations have their own joining guidance.
            </p>
          </article>
        </div>
        <p className="sail-footnote">
          Interested? Open a voyage to send an enquiry. Already invited? Use the
          personal link in your email.
        </p>
      </section>
    </main>
  );
}
