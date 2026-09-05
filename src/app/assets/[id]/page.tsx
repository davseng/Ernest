import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { ComponentDeleteButton } from "@/components/component-delete-button";
import { ErrorNotice } from "@/components/error-notice";
import { SystemDeleteButton } from "@/components/system-delete-button";
import { getAsset } from "@/data/assets";
import { getLogEntries } from "@/data/log-entries";
import { logEntryTypes } from "@/domain/log-entries";
import { addLogEntry } from "./actions";
import { addComponent, addSystem, editComponent, editSystem, removeComponent, removeSystem } from "./inventory-actions";

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
  const logEntries = await getLogEntries(id, session.user.id);
  const createEntry = addLogEntry.bind(null, id);

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
        <AccountMenu email={session.user.email} />
      </header>
      <main className="page-wrap detail-wrap">
        <Link className="back-link" href="/"><span aria-hidden="true">←</span> All assets</Link>
        <section className="asset-header">
          <div>
            <div className="title-row"><h1>{asset.name}</h1><span className="type-pill">{asset.type}</span></div>
            <p className="asset-summary detail-summary">{asset.summary}</p>
            <Link className="edit-asset-link" href={`/assets/${asset.id}/edit`}>Edit asset</Link>
          </div>
          <dl className="asset-facts">
            <div><dt>Make</dt><dd>{asset.make}</dd></div>
            <div><dt>Model</dt><dd>{asset.model}</dd></div>
            <div><dt>Year</dt><dd>{asset.year}</dd></div>
          </dl>
        </section>

        <section className="log-section">
          <div className="section-heading"><p className="eyebrow">Operating history</p><h2>Log</h2><p>{logEntries.length} {logEntries.length === 1 ? "entry" : "entries"}</p></div>
          <div className="log-layout">
            <form className="log-form" action={createEntry}>
              <h3>Add an entry</h3>
              <label>Occurred at<input name="occurredAt" type="datetime-local" required /></label>
              <label>Entry type<select name="entryType" defaultValue="note">{logEntryTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label>Title<input name="title" maxLength={200} required /></label>
              <label>Body<textarea name="body" rows={5} required /></label>
              <div className="coordinate-fields">
                <label>Latitude <span>(optional)</span><input name="latitude" type="number" min="-90" max="90" step="any" /></label>
                <label>Longitude <span>(optional)</span><input name="longitude" type="number" min="-180" max="180" step="any" /></label>
              </div>
              <button type="submit">Add log entry</button>
            </form>
            <div className="log-list">
              {logEntries.length === 0 ? <p className="empty-log">No log entries yet. Add the first record of what happened.</p> : logEntries.map((entry) => (
                <article className="log-entry" key={entry.id}>
                  <div className="log-entry-meta"><span>{entry.entryType}</span><time dateTime={entry.occurredAt.toISOString()}>{entry.occurredAt.toLocaleString()}</time></div>
                  <h3>{entry.title}</h3><p>{entry.body}</p>
                  {entry.latitude !== undefined && entry.longitude !== undefined ? <small>{entry.latitude}, {entry.longitude}</small> : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="systems-section" id="inventory">
          <div className="section-heading"><p className="eyebrow">Inventory</p><h2>Systems</h2><p>{asset.systems.length} systems · {asset.systems.reduce((total, system) => total + system.components.length, 0)} components</p></div>
          <ErrorNotice message={inventoryError} />
          <details className="editor-card add-system">
            <summary>Add a system</summary>
            <form className="compact-form" action={addSystem.bind(null, id)}>
              <label>Name<input name="name" maxLength={100} required /></label>
              <label>Description<textarea name="description" maxLength={500} required /></label>
              <button className="primary-button" type="submit">Add system</button>
            </form>
          </details>
          <div className="system-list">
            {asset.systems.map((system) => (
              <article className="system-card" key={system.id}>
                <div className="system-heading">
                  <div><h3>{system.name}</h3><p>{system.description}</p></div>
                  <span>{system.components.length} components</span>
                </div>
                <details className="editor-card system-editor">
                  <summary>Edit system</summary>
                  <form className="compact-form" action={editSystem.bind(null, id, system.id)}>
                    <label>Name<input name="name" defaultValue={system.name} maxLength={100} required /></label>
                    <label>Description<textarea name="description" defaultValue={system.description} maxLength={500} required /></label>
                    <button className="primary-button" type="submit">Save system</button>
                  </form>
                  <form className="delete-system-form" action={removeSystem.bind(null, id, system.id)}>
                    <SystemDeleteButton name={system.name} />
                  </form>
                </details>
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
                      <details className="editor-card component-editor">
                        <summary>Edit component</summary>
                        <form className="compact-form" action={editComponent.bind(null, id, system.id, component.id)}>
                          <label>Name<input name="name" defaultValue={component.name} maxLength={100} required /></label>
                          <label>Manufacturer<input name="manufacturer" defaultValue={component.manufacturer} maxLength={100} required /></label>
                          <label>Model<input name="model" defaultValue={component.model} maxLength={100} required /></label>
                          <label>Location<input name="location" defaultValue={component.location} maxLength={200} required /></label>
                          <label>Notes<textarea name="notes" defaultValue={component.notes} maxLength={1000} required /></label>
                          <button className="primary-button" type="submit">Save component</button>
                        </form>
                        <form action={removeComponent.bind(null, id, system.id, component.id)}>
                          <ComponentDeleteButton name={component.name} />
                        </form>
                      </details>
                    </div>
                  ))}
                </div>
                <details className="editor-card add-component">
                  <summary>Add a component</summary>
                  <form className="compact-form" action={addComponent.bind(null, id, system.id)}>
                    <label>Name<input name="name" maxLength={100} required /></label>
                    <label>Manufacturer<input name="manufacturer" maxLength={100} required /></label>
                    <label>Model<input name="model" maxLength={100} required /></label>
                    <label>Location<input name="location" maxLength={200} required /></label>
                    <label>Notes<textarea name="notes" maxLength={1000} required /></label>
                    <button className="primary-button" type="submit">Add component</button>
                  </form>
                </details>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
