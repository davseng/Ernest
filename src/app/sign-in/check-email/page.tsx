import Link from "next/link";

export default function CheckEmailPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark" aria-hidden="true">E</span>
        <p className="eyebrow">One more step</p>
        <h1>Check your email</h1>
        <p className="lede">
          We sent you a secure sign-in link. It may take a minute to arrive;
          check your spam folder if you do not see it.
        </p>
        <Link className="text-link" href="/sign-in">Use a different email</Link>
      </section>
    </main>
  );
}
