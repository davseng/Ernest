import Link from "next/link";
import { sailOwnerContext } from "../context";
import {
  sailNotifications,
  sailNotificationProblem,
} from "@/data/sail-notifications";
import { SailNotificationControls } from "@/components/sail/notification-controls";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Email updates",
  robots: { index: false, follow: false },
};
export default async function Notifications() {
  const { session } = await sailOwnerContext();
  let ready = false;
  try {
    ready = await sailNotifications().available();
  } catch {}
  const recipient = (
    process.env.SAIL_NOTIFICATION_EMAIL ?? process.env.SAIL_CONTACT_EMAIL
  )?.trim();
  const ownerEmail =
    process.env.SAIL_NOTIFICATION_OWNER_EMAIL?.trim() || recipient;
  const accountMismatch =
    ownerEmail &&
    session.user.email?.toLowerCase() !== ownerEmail.toLowerCase();
  const rows = ready ? await sailNotifications().status(session.user.id) : [],
    problem = sailNotificationProblem();
  return (
    <main id="sail-main" className="sail-main sail-narrow">
      <p>
        <Link href="/sail/manage">← Trips ahead</Link>
      </p>
      <h1>Email updates</h1>
      <p>
        New enquiries, guest replies and saved changes are queued after they
        succeed. Messages contain a short description and a link to your owner
        workspace.
      </p>
      {problem ? (
        <p className="sail-notice">{problem}</p>
      ) : (
        <p>Email updates are enabled for {recipient}.</p>
      )}
      {accountMismatch ? (
        <p className="sail-notice">
          Updates will stay queued for this account. The notification owner
          email must match your sign-in email. If the recipient is different,
          set SAIL_NOTIFICATION_OWNER_EMAIL to your sign-in email.
        </p>
      ) : null}
      {ready ? (
        <>
          <ul>
            {["pending", "sending", "sent", "failed"].map((state) => (
              <li key={state}>
                {state === "sending"
                  ? "Sending / delivery uncertain"
                  : state === "sent"
                    ? "Accepted for delivery"
                    : state}
                : {rows.find((r) => r.state === state)?.count ?? 0}
              </li>
            ))}
          </ul>
          <p>
            Uncertain sends are kept for review and aren’t retried
            automatically. Accepted for delivery does not guarantee inbox
            receipt.
          </p>
          <SailNotificationControls />
        </>
      ) : (
        <p>Notification setup is pending migration 031.</p>
      )}
    </main>
  );
}
