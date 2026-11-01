import type { Metadata } from "next";
import { sail } from "@/data/sail";
import { SailInvitationContent } from "@/components/sail/invitation-content";
import { sailContactHref } from "@/domain/sail-journey";
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
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <SailInvitationContent
        guest={guest}
        token={token}
        contactHref={sailContactHref(
          process.env.SAIL_CONTACT_EMAIL,
          guest.voyage.title,
        )}
      />
    </main>
  );
}
