import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { getAsset } from "@/data/assets";
import { getLogEntries } from "@/data/log-entries";
import { logEntryTypes } from "@/domain/log-entries";
import { addLogEntry } from "./actions";

export const dynamic = "force-dynamic";

export default async function AssetDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
