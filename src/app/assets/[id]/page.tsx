import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AssetAppHeader } from "@/components/asset-app-header";
import { ErrorNotice } from "@/components/error-notice";
import { SystemDeleteButton } from "@/components/system-delete-button";
import { getAsset } from "@/data/assets";
import { addSystem, editSystem, removeSystem } from "./inventory-actions";

export const dynamic = "force-dynamic";

export default async function AssetDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ inventoryError?: string }>;
}) {
  const { id } = await params;
  const { inventoryError } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();
  const componentCount = asset.systems.reduce((total, system) => total + system.components.length, 0);

  return <div className="app-shell">
    <AssetAppHeader assetId={id} assetName={asset.name} email={session.user.email} />
    <main className="page-wrap detail-wrap">
      <section className="page-heading compact-page-heading">
        <p className="eyebrow">Asset settings</p>
        <h1>{asset.name}</h1>
        <p className="lede">Identity and structure that define this asset in Ernest.</p>
        <div className="record-action-row">
          <Link className="primary-button" href={`/assets/${asset.id}/edit`}>Edit asset identity</Link>
          <Link className="secondary-button" href={`/assets/${asset.id}/knowledge`}>Manage equipment</Link>
        </div>
      </section>

      <section className="systems-section">
        <div className="section-heading"><h2>Asset identity</h2><p>Owner-controlled facts used throughout Ernest.</p></div>
        <dl className="asset-facts setup-facts">
          <div><dt>Type</dt><dd>{asset.type || "—"}</dd></div>
          <div><dt>Make</dt><dd>{asset.make || "—"}</dd></div>
          <div><dt>Model</dt><dd>{asset.model || "—"}</dd></div>
          <div><dt>Year</dt><dd>{asset.year || "—"}</dd></div>
          {asset.registrationNumber ? <div><dt>Registration / VIN</dt><dd>{asset.registrationNumber}</dd></div> : null}
        </dl>
        {asset.summary ? <p className="asset-summary" style={{ marginTop: "1rem" }}>{asset.summary}</p> : null}
      </section>

      <section className="systems-section">
        <div className="section-heading"><h2>System structure</h2><p>{asset.systems.length} systems · {componentCount} equipment records. Systems organize equipment; individual equipment is managed on the Equipment screen or through Chat.</p></div>
        <ErrorNotice message={inventoryError} />
        <details className="record-editor"><summary>Add system</summary><div className="record-editor-panel"><form className="compact-form" action={addSystem.bind(null, id)}><label>Name<input name="name" maxLength={100} required /></label><label>Description<textarea name="description" maxLength={500} /></label><button className="primary-button" type="submit">Add system</button></form></div></details>
        <div className="system-list">{asset.systems.map((system) => <article className="system-card" key={system.id}><div className="system-heading"><div><h3>{system.name}</h3><p>{system.description}</p></div><span>{system.components.length} equipment</span></div><div className="setup-system-actions"><Link className="secondary-button" href={`/assets/${id}/knowledge?system=${encodeURIComponent(system.id)}`}>View equipment</Link><details className="record-editor"><summary>Edit system</summary><div className="record-editor-panel"><form className="compact-form" action={editSystem.bind(null, id, system.id)}><label>Name<input name="name" defaultValue={system.name} maxLength={100} required /></label><label>Description<textarea name="description" defaultValue={system.description} maxLength={500} /></label><button className="primary-button" type="submit">Save system</button></form><div className="danger-zone"><strong>Permanent deletion</strong><p>Deleting a system also deletes the equipment records inside it. Use only for setup mistakes.</p><form action={removeSystem.bind(null, id, system.id)}><SystemDeleteButton name={system.name} /></form></div></div></details></div></article>)}</div>
      </section>
    </main>
  </div>;
}
