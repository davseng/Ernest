import Link from "next/link";
import { notFound } from "next/navigation";

import { getAsset } from "@/data/assets";

export default async function AssetDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = getAsset(id);

  if (!asset) notFound();

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
        <span className="demo-label">Demo workspace</span>
      </header>
      <main className="page-wrap detail-wrap">
        <Link className="back-link" href="/"><span aria-hidden="true">←</span> All assets</Link>
        <section className="asset-header">
          <div>
            <div className="title-row"><h1>{asset.name}</h1><span className="type-pill">{asset.type}</span></div>
            <p className="asset-summary detail-summary">{asset.summary}</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Make</dt><dd>{asset.make}</dd></div>
            <div><dt>Model</dt><dd>{asset.model}</dd></div>
            <div><dt>Year</dt><dd>{asset.year}</dd></div>
          </dl>
        </section>

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Inventory</p><h2>Systems</h2><p>{asset.systems.length} systems · {asset.systems.reduce((total, system) => total + system.components.length, 0)} components</p></div>
          <div className="system-list">
            {asset.systems.map((system) => (
              <article className="system-card" key={system.id}>
                <div className="system-heading">
                  <div><h3>{system.name}</h3><p>{system.description}</p></div>
                  <span>{system.components.length} components</span>
                </div>
                <div className="component-list">
                  {system.components.map((component) => (
                    <div className="component" key={component.id}>
                      <h4>{component.name}</h4>
                      <dl className="component-facts">
                        <div><dt>Manufacturer</dt><dd>{component.manufacturer}</dd></div>
                        <div><dt>Model</dt><dd>{component.model}</dd></div>
                        <div><dt>Location</dt><dd>{component.location}</dd></div>
                      </dl>
                      <p className="notes"><span>Notes</span>{component.notes}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
