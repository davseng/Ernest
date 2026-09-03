import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  if (await auth()) redirect("/");

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark" aria-hidden="true">E</span>
        <p className="eyebrow">Welcome to Ernest</p>
        <h1>Sign in</h1>
        <p className="lede">Enter your email and we’ll send you a secure sign-in link.</p>
        <form className="auth-form" action={async (formData) => {
          "use server";
          await signIn("resend", formData);
        }}>
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          <input type="hidden" name="redirectTo" value="/" />
          <button type="submit">Email me a sign-in link</button>
        </form>
      </section>
    </main>
  );
}
