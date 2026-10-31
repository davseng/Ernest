import "server-only";
import { createTransport } from "nodemailer";
import { departureLabel } from "../domain/sail";
import type { Voyage } from "./sail-store";
export function sailMailProblem(email: string): string | null {
  const raw = process.env.SAIL_EMAIL_ENABLED;
  if (raw?.trim().toLowerCase() !== "true") {
    // Only non-sensitive deployment identity is included, never environment values.
    const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
    const build = /^[a-f0-9]{40}$/i.test(sha) ? sha.slice(0, 7) : "unknown";
    const env = ["production", "preview", "development"].includes(
      process.env.VERCEL_ENV ?? "",
    )
      ? process.env.VERCEL_ENV
      : "unspecified environment";
    const setting =
      raw === undefined
        ? "missing from this running deployment"
        : !raw.trim()
          ? "empty in this running deployment"
          : raw.trim().toLowerCase() === "false"
            ? "set to false in this running deployment"
            : "present but not a valid true/false value; enter true without quotation marks";
    return `Email delivery is not enabled: SAIL_EMAIL_ENABLED is ${setting}. Deployment: ${env}, build ${build}. The person is saved; no invitation was sent.`;
  }
  if (process.env.VERCEL_ENV !== "production") {
    const allowed = (process.env.SAIL_TEST_RECIPIENTS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!allowed.includes(email.toLowerCase()))
      return "Preview invitations can only be sent to configured test recipients.";
  }
  const origin = process.env.SAIL_BASE_URL?.trim();
  try {
    const u = new URL(origin ?? "");
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash
    )
      throw Error();
  } catch {
    return "The invitation website address is not configured. No email was sent.";
  }
  if (
    !process.env.EMAIL_FROM ||
    !process.env.EMAIL_SERVER_USER ||
    !process.env.EMAIL_SERVER_PASSWORD
  )
    return "Invitation email is not configured. No email was sent.";
  return null;
}
export async function sendSailInvitation(input: {
  token: string;
  email: string;
  fullName: string;
  role: "crew" | "passenger";
  voyage: Voyage;
}) {
  const problem = sailMailProblem(input.email);
  if (problem) throw Error(problem);
  const origin = process.env.SAIL_BASE_URL!.trim().replace(/\/$/, "");
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
  const { voyage: v } = input;
  const result = await transport.sendMail({
    from: process.env.EMAIL_FROM!,
    to: input.email,
    subject: `Sail Far Better: ${v.title}`,
    text: [
      `Hello ${input.fullName},`,
      `I’d love you to join me aboard ${v.assetName} as ${input.role === "crew" ? "crew" : "a passenger"}.`,
      `${v.departurePort || "Departure to be arranged"} → ${v.arrivalPort || "Destination to be arranged"}`,
      departureLabel(v.departureFrom, v.departureTo),
      v.timingNote,
      "Weather and boat jobs can move things around. Your personal invitation has the latest plan, what to expect, and a place to let me know whether you can join.",
      `${origin}/sail/invitations/${input.token}`,
      "Keep this personal link to yourself. It lasts for 30 days; if it has expired, ask me for a fresh one.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  if (!result.accepted?.length || result.rejected?.length)
    throw Error(
      "Invitation email was not accepted for delivery. Please retry.",
    );
}
