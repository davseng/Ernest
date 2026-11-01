import type { Metadata } from "next";
import Link from "next/link";
import "./sail.css";
export const metadata: Metadata = {
  title: { default: "Sail Far Better", template: "%s · Sail Far Better" },
  description:
    "Friends and family aboard Far Better. Take a look around and let’s figure out a trip together.",
  robots: {
    index: process.env.VERCEL_ENV === "production",
    follow: process.env.VERCEL_ENV === "production",
  },
};
export default function SailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="sail-site">
      <a className="sail-skip" href="#sail-main">
        Skip to content
      </a>
      <header className="sail-header">
        <Link href="/sail" className="sail-brand">
          <span aria-hidden="true">↗</span> Sail Far Better
        </Link>
        <nav aria-label="Sail Far Better">
          <Link href="/sail/trips">Trips ahead</Link>
          <Link href="/sail/boat">The Boat</Link>
          <Link href="/sail/join">Joining us</Link>
          <Link href="/sail/manage" className="sail-owner-link">
            Owner sign-in
          </Link>
        </nav>
      </header>
      {children}
      <footer className="sail-footer">
        <strong>Sail Far Better</strong>
        <span>Friends, family, and a bit of time on the water.</span>
        <Link href="/sail/manage">Owner workspace</Link>
      </footer>
    </div>
  );
}
