import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AssetAppHeader } from "@/components/asset-app-header";
import { getAsset } from "@/data/assets";
import { getInventoryItems, getInventoryLocations } from "@/data/inventory";

export const dynamic = "force-dynamic";

export default async function InventoryPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string; location?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const [asset, items, locations] = await Promise.all([
    getAsset(id, session.user.id),
    getInventoryItems(id, session.user.id),
    getInventoryLocations(id, session.user.id),
  ]);
  if (!asset) notFound();

  const text = (query?.q ?? "").trim().toLowerCase();
  const location = (query?.location ?? "").trim();
  const filtered = items.filter((item) => {
    const matchesText = !text || [item.name, item.details, item.locations.join(" ")].filter(Boolean).join(" ").toLowerCase().includes(text);
    const matchesLocation = !location || item.locations.includes(location);
    return matchesText && matchesLocation;
  });

  return (
    <div className="app-shell">
      <AssetAppHeader assetId={id} assetName={asset.name} email={session.user.email} />
      <main className="page-wrap detail-wrap">
        <section className="asset-header">
          <div>
            <p className="eyebrow">Inventory</p>
            <div className="title-row"><h1>Find what&apos;s aboard</h1><span className="type-pill">{items.length} items</span></div>
            <p className="asset-summary detail-summary">Search {asset.name} by item, detail, or storage location.</p>
          </div>
        </section>

        <section className="systems-section">
          <form className="compact-form" method="get">
            <label>Find something<input name="q" defaultValue={query?.q ?? ""} placeholder="oil filter, cable cutter, Q3…" /></label>
            <label>Location<select name="location" defaultValue={location}><option value="">All locations</option>{locations.map((entry) => <option value={entry.code} key={entry.code}>{entry.code}{entry.label ? ` — ${entry.label}` : ""} ({entry.itemCount})</option>)}</select></label>
            <button className="primary-button">Search inventory</button>
            {(text || location) ? <Link className="edit-asset-link" href={`/assets/${id}/inventory`}>Clear filters</Link> : null}
          </form>
        </section>

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Results</p><h2>{filtered.length} item{filtered.length === 1 ? "" : "s"}</h2></div>
          {filtered.length === 0 ? <p className="empty-log">No inventory items match those filters.</p> : <div className="log-list">
            {filtered.map((item) => <article className="log-entry" key={item.id}>
              <div className="log-entry-meta"><span>{item.locations.length ? item.locations.join(" · ") : "LOCATION NOT RECORDED"}</span>{item.quantity ? <span>QTY {item.quantity}</span> : null}</div>
              <h3>{item.name}</h3>
              {item.details ? <p>{item.details}</p> : null}
              {(item.sourceLabel || item.sourcePage) ? <p className="asset-summary">Source: {item.sourceLabel ?? "Inventory import"}{item.sourcePage ? ` · page ${item.sourcePage}` : ""}</p> : null}
            </article>)}
          </div>}
        </section>

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Storage</p><h2>Location codes</h2><p>Browse the storage codes already used aboard {asset.name}.</p></div>
          <div className="log-list">{locations.map((entry) => <article className="log-entry" key={entry.code}><div className="log-entry-meta"><span>{entry.code}</span><span>{entry.itemCount} item{entry.itemCount === 1 ? "" : "s"}</span></div>{entry.label ? <h3>{entry.label}</h3> : null}{entry.notes ? <p>{entry.notes}</p> : null}</article>)}</div>
        </section>
      </main>
    </div>
  );
}
