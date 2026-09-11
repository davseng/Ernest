import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { PhotoUploadPanel } from "@/components/photo-upload-panel";
import { getAsset } from "@/data/assets";
import { listPhotos } from "@/data/photos";
import { deletePhotoAction, updatePhotoAction } from "../photo-actions";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function PhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();
  const photos = await listPhotos(id, session.user.id);
  const components = asset.systems.flatMap((system) => system.components.map((component) => ({
    id: component.id,
    label: `${system.name} · ${component.name}`,
  })));

  const savedMessage = query?.saved === "updated"
    ? "✓ Photo details saved."
    : query?.saved === "deleted"
      ? "✓ Photo deleted."
      : undefined;

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
        <AccountMenu email={session.user.email} />
      </header>
      <main className="page-wrap detail-wrap">
        <Link className="back-link" href={`/?asset=${id}`}>← {asset.name}</Link>
        <section className="asset-header">
          <div>
            <p className="eyebrow">Evidence</p>
            <div className="title-row"><h1>Photos</h1><span className="type-pill">v0.8</span></div>
            <p className="asset-summary detail-summary">Private visual evidence for {asset.name}: equipment, data plates, panels, plumbing, rigging, installations, spares, and before/after maintenance.</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Photos</dt><dd>{photos.length}</dd></div>
            <div><dt>Linked to equipment</dt><dd>{photos.filter((photo) => photo.componentId).length}</dd></div>
          </dl>
        </section>

        {savedMessage ? <p className="operation-status">{savedMessage}</p> : null}
        <PhotoUploadPanel assetId={id} />

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">Visual evidence</p>
            <h2>Photo library</h2>
            <p>Upload first. Add context only when you know it. Ernest should never infer an equipment identity from a photo without later confirmation.</p>
          </div>
          {photos.length === 0 ? (
            <p className="empty-log">No photos yet. Start with a data plate, equipment installation, panel, plumbing run, or anything you may want Ernest to remember visually.</p>
          ) : (
            <div className="photo-evidence-grid">
              {photos.map((photo) => (
                <article className="photo-evidence-card" key={photo.id}>
                  <a className="photo-evidence-preview" href={`/assets/${id}/photos/${photo.id}/original`} target="_blank" rel="noreferrer">
                    {photo.contentType === "image/heic" || photo.contentType === "image/heif" ? (
                      <div className="photo-format-placeholder">HEIC<br/><small>Open original</small></div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/assets/${id}/photos/${photo.id}/original`} alt={photo.title} loading="lazy" />
                    )}
                  </a>
                  <div className="photo-evidence-body">
                    <div className="log-entry-meta"><span>{photo.contentType.replace("image/", "").toUpperCase()}</span><span>{formatBytes(photo.sizeBytes)}</span></div>
                    <h3>{photo.title}</h3>
                    <p className="asset-summary">{photo.originalFilename}</p>
                    <form className="compact-form" action={updatePhotoAction.bind(null, id, photo.id)}>
                      <label>Title<input name="title" defaultValue={photo.title} maxLength={200} required /></label>
                      <label>Equipment association
                        <select name="componentId" defaultValue={photo.componentId ?? ""}>
                          <option value="">Not linked</option>
                          {components.map((component) => <option value={component.id} key={component.id}>{component.label}</option>)}
                        </select>
                      </label>
                      <label>Notes<textarea name="notes" defaultValue={photo.notes ?? ""} rows={3} placeholder="What this shows, where it is, why it matters…" /></label>
                      <button className="primary-button" type="submit">Save photo details</button>
                    </form>
                    <div className="photo-evidence-actions">
                      <a className="edit-asset-link" href={`/assets/${id}/photos/${photo.id}/original`} target="_blank" rel="noreferrer">Open original ↗</a>
                      <form action={deletePhotoAction.bind(null, id, photo.id)}>
                        <button className="delete-button" type="submit">Delete photo</button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
