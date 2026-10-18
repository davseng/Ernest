/** Keep Preview sessions independent of legacy cookies on the parent domain. */
export function authCookies(env: NodeJS.ProcessEnv) {
  if (env.VERCEL_ENV === "preview") {
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: true,
    };
    return {
      sessionToken: { name: "__Host-ernest-preview.session-token", options },
      callbackUrl: { name: "__Host-ernest-preview.callback-url", options },
      csrfToken: { name: "__Host-ernest-preview.csrf-token", options },
    };
  }
  const domain = env.AUTH_COOKIE_DOMAIN?.trim();
  return domain ? {
    sessionToken: {
      name: "__Secure-authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: true,
        domain,
      },
    },
  } : undefined;
}
