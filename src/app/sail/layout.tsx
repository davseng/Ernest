import type { Metadata } from "next";
import Link from "next/link";
import "./sail.css";
export const metadata: Metadata = {
  title: { default: "Sail Far Better", template: "%s · Sail Far Better" },
  description:
    "Voyages, people and life aboard. Follow the plan and find your place on board.",
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
          <Link href="/sail#voyages">Voyages</Link>
          <Link href="/sail#joining">Joining us</Link>
          <Link href="/sail/manage" className="sail-owner-link">
            Owner sign-in
          </Link>
        </nav>
      </header>
      {children}
      <footer className="sail-footer">
        <strong>Sail Far Better</strong>
        <span>Plans can change. Good communication makes the difference.</span>
        <Link href="/sail/manage">Owner workspace</Link>
      </footer>
    </div>
  );
}
