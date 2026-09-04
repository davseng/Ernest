import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { getAssets } from "@/data/assets";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const assets = await getAssets(session.user.id);

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Ernest home">
          <span className="brand-mark" aria-hidden="true">E</span>
          Ernest
        </Link>
        <AccountMenu email={session.user.email} />
      </header>

      <main className="page-wrap">
        <section className="page-heading">
          <p className="eyebrow">Overview</p>
          <h1>Your assets</h1>
          <p className="lede">The essential details of the things you care for.</p>
        </section>

        {assets.map((asset) => <Link className="asset-card" href={`/assets/${asset.id}`} key={asset.id}>
          <div className="asset-card-top">
            <div className="asset-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32"><path d="M5 20h22l-4 6H10l-5-6Zm6-2V8h9l4 10H11Zm2-8v8h8.8l-3.2-8H13Z" /></svg>
            </div>
            <span className="type-pill">{asset.type}</span>
          </div>
          <div className="asset-card-body">
            <h2>{asset.name}</h2>
            <p className="asset-spec">{asset.year} {asset.make} {asset.model}</p>
            <p className="asset-summary">{asset.summary}</p>
          </div>
          <div className="asset-card-footer">
            <span>{asset.systems.length} systems</span>
            <span className="view-link">View asset <span aria-hidden="true">→</span></span>
          </div>
        </Link>)}
      </main>
    </div>
  );
}
