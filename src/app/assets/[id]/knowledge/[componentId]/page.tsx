import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AssetAppHeader } from "@/components/asset-app-header";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";
import { getComponentDocumentLinks, getComponentLifecycles } from "@/data/equipment-knowledge";
import {
  changeEquipmentLifecycle,
  deleteEquipment,
  editEquipment,
  linkEquipmentDocument,
  unlinkEquipmentDocument,
} from "../../knowledge-actions";

export const dynamic = "force-dynamic";

function lifecycleLabel(status: "installed" | "removed_replaced" | "unknown") {
  if (status === "removed_replaced") return "Removed / replaced";
  if (status === "unknown") return "Install status unknown";
  return "Installed";
}

export default async function EquipmentDetailPage({ params, searchParams }: {
  params: Promise<{ id: string; componentId: string }>;
  searchParams?: Promise<{ status?: string }>;
}) {
  const { id, componentId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();
  const component = asset.systems.flatMap((system) => system.components.map((item) => ({ ...item, systemName: system.name }))).find((item) => item.id === componentId);
  if (!component) notFound();

  const [documents, links, lifecycles] = await Promise.all([
    getDocumentsForAsset(id, session.user.id),
    getComponentDocumentLinks(id, session.user.id),
    getComponentLifecycles(id, session.user.id),
  ]);
  const componentLinks = links.filter((link) => link.componentId === componentId);
  const lifecycle = lifecycles.find((item) => item.componentId === componentId) ?? { componentId, status: "installed" as const, changedOn: null, notes: null };
  const returnTo = `/assets/${id}/knowledge/${componentId}`;

  const statusMessage = query?.status === "equipment-saved" ? "✓ Equipment changes saved."
    : query?.status === "lifecycle-installed" ? "✓ Marked Installed."
    : query?.status === "lifecycle-removed_replaced" ? "✓ Moved to Removed / replaced history."
    : query?.status === "lifecycle-unknown" ? "✓ Install status marked Unknown."
    : null;

  return (
    <div className="app-shell">
      <AssetAppHeader assetId={id} assetName={asset.name} email={session.user.email} />
      <main className="page-wrap form-page equipment-detail-page">
        <Link className="back-link" href={`/assets/${id}/knowledge`}>← Equipment</Link>
        {statusMessage ? <p className="operation-status" role="status">{statusMessage}</p> : null}

        <section className="page-heading compact-page-heading">
          <p className="eyebrow">{component.systemName} · {lifecycleLabel(lifecycle.status)}</p>
          <h1>{component.name}</h1>
          <p className="lede">Update identity, lifecycle, and source links without leaving this equipment record.</p>
        </section>

        <section className="focused-editor-section">
          <h2>Equipment details</h2>
          <form className="record-form" action={editEquipment.bind(null, id, component.systemId, component.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="form-grid">
              <label>Name<input name="name" required defaultValue={component.name} /></label>
              <label>Manufacturer<input name="manufacturer" defaultValue={component.manufacturer ?? ""} /></label>
              <label>Model<input name="model" defaultValue={component.model ?? ""} /></label>
              <label>Serial number<input name="serialNumber" defaultValue={component.serialNumber ?? ""} /></label>
              <label>Installed location<input name="location" defaultValue={component.location ?? ""} /></label>
            </div>
            <label>Notes<textarea name="notes" rows={4} defaultValue={component.notes ?? ""} /></label>
            <div className="editor-actions"><button className="primary-button" type="submit">Save equipment</button><Link className="secondary-action" href={`/assets/${id}/knowledge`}>Done</Link></div>
          </form>
        </section>

        <section className="focused-editor-section">
          <h2>Lifecycle</h2>
          <p className="asset-summary">Keep replaced equipment as history instead of deleting it. Historical manuals, photos, and service records remain useful without proving that equipment is installed today.</p>
          <form className="record-form" action={changeEquipmentLifecycle.bind(null, id, component.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <label>Status<select name="lifecycleStatus" defaultValue={lifecycle.status}><option value="installed">Installed</option><option value="removed_replaced">Removed / replaced</option><option value="unknown">Install status unknown</option></select></label>
            <div className="form-grid">
              <label>Date changed <span>(optional)</span><input name="lifecycleChangedOn" type="date" defaultValue={lifecycle.changedOn ?? ""} /></label>
              <label>Lifecycle note <span>(optional)</span><input name="lifecycleNotes" defaultValue={lifecycle.notes ?? ""} placeholder="Replaced by…, status uncertain because…" /></label>
            </div>
            <button className="primary-button" type="submit">Save lifecycle</button>
          </form>
        </section>

        <section className="focused-editor-section">
          <h2>Evidence</h2>
          {componentLinks.length === 0 ? <p className="empty-log">No documents are linked to this equipment.</p> : <div className="log-list">{componentLinks.map((link) => (
            <article className="log-entry equipment-source-row" key={`${link.componentId}:${link.documentId}`}>
              <div><strong><Link href={`/assets/${id}/documents/${link.documentId}`}>{link.documentTitle}</Link></strong><p>{link.relationship}</p></div>
              <form action={unlinkEquipmentDocument.bind(null, id, component.id, link.documentId)}><button className="secondary-action" type="submit">Unlink</button></form>
            </article>
          ))}</div>}
          {documents.length ? <form className="record-form" action={linkEquipmentDocument.bind(null, id)}>
            <input type="hidden" name="componentId" value={component.id} />
            <label>Link document<select name="documentId" required defaultValue=""><option value="" disabled>Select a document</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
            <label>Relationship<select name="relationship" defaultValue="manual"><option value="manual">Manual</option><option value="service">Service document</option><option value="reference">Reference</option><option value="other">Other</option></select></label>
            <button className="primary-button" type="submit">Link document</button>
          </form> : null}
        </section>

        <section className="focused-editor-section destructive-zone">
          <h2>Permanent deletion</h2>
          <p>Use this only for mistakes or duplicates. For real equipment that was removed, change the lifecycle to Removed / replaced instead.</p>
          <form className="record-form danger-form" action={deleteEquipment.bind(null, id, component.systemId, component.id)}>
            <label>Confirm deletion<select name="confirm" required defaultValue=""><option value="" disabled>Choose…</option><option value="yes">Permanently delete {component.name}</option></select></label>
            <button className="delete-button" type="submit">Delete equipment permanently</button>
          </form>
        </section>
      </main>
    </div>
  );
}
