import "server-only";
import postgres from "postgres";
import { after } from "next/server";
import { createTransport } from "nodemailer";
import { sailMailProblem } from "./sail-mail";
import { sailInvitationOrigin } from "./sail-invitation-url";
import { createSailNotificationStore } from "./sail-notification-store";
let sql: ReturnType<typeof postgres> | undefined;
const notificationCopy = (text: string) =>
  text.replace(/\benquiry\b/g, "inquiry").replace(/\bEnquiry\b/g, "Inquiry");
export function sailNotifications() {
  if (!process.env.DATABASE_URL) throw Error("Database is not configured.");
  return createSailNotificationStore(
    (sql ??= postgres(process.env.DATABASE_URL, { max: 3 })),
  );
}
export function sailNotificationProblem() {
  if (process.env.SAIL_NOTIFICATIONS_ENABLED?.trim().toLowerCase() !== "true")
    return "Email updates are paused. Set SAIL_NOTIFICATIONS_ENABLED=true to enable them.";
  const recipient = (
    process.env.SAIL_NOTIFICATION_EMAIL ?? process.env.SAIL_CONTACT_EMAIL
  )?.trim();
  if (!recipient || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(recipient))
    return "Set SAIL_NOTIFICATION_EMAIL to the owner’s email address.";
  return sailMailProblem(recipient);
}
/** SMTP acceptance is not inbox receipt. Claimed/uncertain sends are never auto-retried. */
export async function dispatchSailNotifications(owner?: string) {
  const problem = sailNotificationProblem();
  if (problem) return { ok: false, message: problem };
  const recipient = (process.env.SAIL_NOTIFICATION_EMAIL ??
    process.env.SAIL_CONTACT_EMAIL)!.trim();
  const origin = sailInvitationOrigin(),
    store = sailNotifications();
  if (!(await store.available()))
    return {
      ok: false,
      message: "Notification setup is pending migration 031.",
    };
  const ownerEmail =
    process.env.SAIL_NOTIFICATION_OWNER_EMAIL?.trim() || recipient;
  const events = await store.claim(ownerEmail, owner);
  if (!events.length)
    return {
      ok: true,
      message: "No pending updates for the configured owner account.",
    };
  const transport = createTransport({
    host: process.env.EMAIL_SERVER_HOST ?? "smtp-relay.brevo.com",
    port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  let accepted = false;
  try {
    const result = await transport.sendMail({
      from: process.env.EMAIL_FROM!,
      to: recipient,
      subject:
        events.length === 1
          ? `Sail Far Better: ${notificationCopy(events[0].summary)}`
          : `Sail Far Better: ${events.length} updates`,
      text: [
        "There’s an update aboard.",
        ...events.map(
          (e) =>
            `${notificationCopy(e.summary)}${e.title ? `: ${e.title}` : ""}\n${origin}/sail/manage${e.category === "sail_media" ? "/photos" : e.category === "sail_positions" ? "/position" : e.voyageId ? `/${e.voyageId}` : ""}`,
        ),
        "Open your owner workspace to see the details. These links require your owner sign-in; no personal guest invitation links are included.",
      ].join("\n\n"),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw Error("Not accepted");
    accepted = true;
  } catch {
    await store.complete(
      events.map((e) => e.id),
      false,
    );
    return {
      ok: false,
      message:
        "Email delivery was not confirmed. Review failed updates before retrying.",
    };
  }
  // If recording acceptance fails, leave 'sending' as uncertain; do not resend automatically.
  if (accepted)
    await store.complete(
      events.map((e) => e.id),
      true,
    );
  return {
    ok: true,
    message: `${events.length} updates accepted for email delivery.`,
  };
}
export function scheduleSailNotifications() {
  if (process.env.SAIL_NOTIFICATIONS_ENABLED?.trim().toLowerCase() !== "true")
    return;
  try {
    after(async () => {
      try {
        await dispatchSailNotifications();
      } catch {
        /* Queue remains inspectable; never fail a saved user action or log secrets. */
      }
    });
  } catch {
    /* Synthetic/non-request callers cannot schedule; queue remains durable. */
  }
}
