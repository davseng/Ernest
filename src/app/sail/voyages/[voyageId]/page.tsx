import { notFound } from "next/navigation";
import { sail } from "@/data/sail";
import { sailPhotos } from "@/data/sail-photos";
import { SailPhotoGallery } from "@/components/sail/photo-gallery";
import { SailVoyageOverview } from "@/components/sail/voyage-overview";
import { SailInterestForm } from "@/components/sail/interest-form";
export const dynamic = "force-dynamic";
export default async function PublicVoyagePage({
  params,
  searchParams,
}: {
  params: Promise<{ voyageId: string }>;
  searchParams?: Promise<{ as?: string }>;
}) {
  const { voyageId } = await params;
  const query = await searchParams,
    preferredRole = query?.as === "passenger" ? "passenger" : "crew";
  if (!(await sail().available())) notFound();
  const voyage = await sail().publicVoyage(voyageId);
  if (!voyage) notFound();
  let photoReady = false;
  try {
    photoReady = await sailPhotos().available();
  } catch {}
  const photos = photoReady ? await sailPhotos().publicPhotos(voyage.id) : [];
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <SailVoyageOverview voyage={voyage} />
      {photos.length ? (
        <section className="sail-section">
          <h2>A glimpse of the journey</h2>
          <SailPhotoGallery photos={photos} />
          <p className="sail-footnote">
            Photographs offer a sense of the voyage; weather and readiness
            determine the final route.
          </p>
        </section>
      ) : null}
      {!["completed", "cancelled"].includes(voyage.status) ? (
        <section className="sail-section" id="enquiry">
          <h2>Interested in coming?</h2>
          <p>
            Send me a note and we’ll work out whether this trip fits. This is a
            conversation starter, not a reservation. No sign-in needed.
          </p>
          <SailInterestForm
            key={preferredRole}
            voyageId={voyage.id}
            preferredRole={preferredRole}
          />
          <p className="sail-footnote">
            Your name, email and message are private to the vessel owner.
          </p>
        </section>
      ) : (
        <p className="sail-notice">
          This voyage is {voyage.status} and is not accepting enquiries.
        </p>
      )}
    </main>
  );
}
