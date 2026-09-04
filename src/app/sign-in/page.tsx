import { ErrorNotice } from "@/components/error-notice";

import { requestSignInLink } from "./actions";

const signInErrors: Record<string, string> = {
  AccessDenied: "That email address is not allowed to sign in.",
  Configuration: "Sign-in email could not be sent. Please try again later or contact the administrator.",
  EmailSignInError: "Sign-in email could not be sent. Check the address and try again.",
  Verification: "That sign-in link is invalid or has expired. Request a new link below.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error
    ? signInErrors[error] ?? "We could not sign you in. Please request a new link."
    : undefined;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark" aria-hidden="true">E</span>
        <p className="eyebrow">Welcome to Ernest</p>
        <h1>Sign in</h1>
        <p className="lede">Enter your email and we’ll send you a secure sign-in link.</p>
        <ErrorNotice message={errorMessage} />
        <form className="auth-form" action={requestSignInLink}>
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          <button type="submit">Email me a sign-in link</button>
        </form>
      </section>
    </main>
  );
}
