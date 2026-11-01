import "server-only";
/** Fixed configured origin only; never derive invitation links from request headers. */
export function sailInvitationOrigin() {
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
    return u.origin;
  } catch {
    throw Error(
      "The invitation website address is not configured. Set SAIL_BASE_URL to the public HTTPS website address.",
    );
  }
}
