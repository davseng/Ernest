import Link from "next/link";
import { sail } from "@/data/sail";
import { sailPhotos } from "@/data/sail-photos";
import { SailPhotoGallery } from "@/components/sail/photo-gallery";
import { departureLabel } from "@/domain/sail";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Joining us",
  description:
    "Friends, family and a bit of time on the water. Let’s figure out a trip together.",
};
export default async function SailJoinPage({
  searchParams,
}: {
  searchParams?: Promise<{ as?: string }>;
}) {
  const query = await searchParams,
    role = query?.as === "passenger" ? "passenger" : "crew";
  let ready = false,
    photoReady = false;
  try {
    ready = await sail().available();
    photoReady = await sailPhotos().available();
  } catch {}
  const voyages = ready
      ? (await sail().publicList()).filter(
          (v) => !["cancelled", "completed"].includes(v.status),
        )
      : [],
    photos = photoReady
      ? (await sailPhotos().publicPhotos()).map((p) => ({ ...p }))
      : [],
    crewPhoto =
      photos.find((p) => p.category === "cockpit") ??
      photos.find((p) => p.category === "sailing"),
    passengerPhoto =
      photos.find((p) => p.category === "salon") ??
      photos.find((p) => p.category === "forward_berth");
  return (
    <main id="sail-main" className="sail-main sail-story">
      <section className="sail-join-intro">
        <p className="sail-kicker">Friends & family aboard</p>
        <h1>Come along.</h1>
        <p className="sail-story-lede">
          Some friends want to get involved in the sailing. Others would rather
          take in the ride. Either way, let’s talk about what would make a good
          trip for you.
        </p>
      </section>
      <section className="sail-join-paths" aria-label="Two ways to join">
        <article id="crew" className="sail-join-path">
          {crewPhoto ? (
            <SailPhotoGallery photos={[crewPhoto]} allPhotos={photos} />
          ) : null}
          <div>
            <p className="sail-kicker">Joining as crew</p>
            <h2>
              Fancy helping
              <br />
              with the sailing?
            </h2>
            <p>
              Tell me what you’ve done before and what you’d like to try. We’ll
              talk through the jobs, watches and preparation for that trip.
            </p>
            <Link
              href="/sail/join?as=crew#join-voyages"
              className="sail-button"
            >
              Look at the trips →
            </Link>
          </div>
        </article>
        <article id="passenger" className="sail-join-path">
          {passengerPhoto ? (
            <SailPhotoGallery photos={[passengerPhoto]} allPhotos={photos} />
          ) : null}
          <div>
            <p className="sail-kicker">Joining as a passenger</p>
            <h2>
              Coming along
              <br />
              for the ride?
            </h2>
            <p>
              We’ll talk about what a day aboard is like, where you might sleep,
              and anything that would help you feel comfortable. Bring your
              questions.
            </p>
            <Link
              href="/sail/join?as=passenger#join-voyages"
              className="sail-button"
            >
              Look at the trips →
            </Link>
          </div>
        </article>
      </section>
      <section className="sail-story-section">
        <div className="sail-story-heading">
          <p className="sail-kicker">No grand process</p>
          <h2>Here’s how we make it happen.</h2>
        </div>
        <ol className="sail-join-steps">
          <li>
            <span>01</span>
            <h3>See what I’m planning.</h3>
            <p>A route and some rough timing are a good place to start.</p>
          </li>
          <li>
            <span>02</span>
            <h3>Have a chat.</h3>
            <p>Let’s talk about dates, expectations and what works for you.</p>
          </li>
          <li>
            <span>03</span>
            <h3>Get your invitation.</h3>
            <p>I’ll send you a personal link with the details for your trip.</p>
          </li>
          <li>
            <span>04</span>
            <h3>Get ready to come aboard.</h3>
            <p>
              We’ll sort out packing, meeting up and any last-minute changes.
            </p>
          </li>
        </ol>
      </section>
      <section className="sail-story-section sail-join-questions">
        <div className="sail-story-heading">
          <p className="sail-kicker">A few things you might wonder</p>
          <h2>Let’s talk it through.</h2>
        </div>
        <div>
          <details>
            <summary>Are the dates fixed?</summary>
            <p>
              They’re best read as a plan. Weather and getting the boat ready
              can move things around. Have a chat with me before making travel
              arrangements.
            </p>
          </details>
          <details>
            <summary>Which berth would I use?</summary>
            <p>
              I’ll confirm sleeping arrangements with you before you join. You
              can have a look at the berths on{" "}
              <Link href="/sail/boat#berths">The Boat page</Link>.
            </p>
          </details>
          <details>
            <summary>What should I bring?</summary>
            <p>
              We’ll talk through what to bring. Your invitation is where I’ll
              put the details for that trip.
            </p>
          </details>
          <details>
            <summary>Do I need to choose crew or passenger now?</summary>
            <p>
              Pick whichever sounds closer when you send a note. We can discuss
              it and I’ll confirm your role in the invitation.
            </p>
          </details>
        </div>
      </section>
      <section id="join-voyages" className="sail-story-section">
        <div className="sail-section-heading">
          <div>
            <p className="sail-kicker">What I’m thinking about next</p>
            <h2>Find a trip to talk about.</h2>
          </div>
          <p>
            Looking at joining as {role}.{" "}
            <Link
              href={`/sail/join?as=${role === "crew" ? "passenger" : "crew"}#join-voyages`}
            >
              Change to {role === "crew" ? "passenger" : "crew"}
            </Link>
          </p>
        </div>
        {voyages.length ? (
          <div className="sail-cards">
            {voyages.map((v) => (
              <article key={v.id} className="sail-card">
                <h3>{v.title}</h3>
                <p>
                  {v.departurePort} → {v.arrivalPort}
                </p>
                <p>{departureLabel(v.departureFrom, v.departureTo)}</p>
                <Link
                  className="sail-text-link"
                  href={`/sail/voyages/${v.id}?as=${role}#enquiry`}
                >
                  Let’s talk about this one →
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p>I’ll put the next trips here as the plans take shape.</p>
        )}
        <p className="sail-footnote">
          Already invited? Your personal email link has the latest plan and your
          joining details.
        </p>
      </section>
    </main>
  );
}
