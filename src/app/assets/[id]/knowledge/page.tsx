import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";
import { getEquipmentCandidates } from "@/data/equipment-candidates";
import { getComponentDocumentLinks, getComponentLifecycles } from "@/data/equipment-knowledge";
import {
  approveEquipment,
  changeEquipmentLifecycle,
  deleteEquipment,
  editEquipment,
  linkEquipmentDocument,
  rejectEquipment,
  scanDocumentForEquipment,
  unlinkEquipmentDocument,
} from "../knowledge-actions";

export const dynamic = "force-dynamic";

function lifecycleLabel(status: "installed" | "removed_replaced" | "unknown") {
  if (status === "removed_replaced") return "REMOVED / REPLACED";
  if (status === "unknown") return "INSTALL STATUS UNKNOWN";
  return "INSTALLED";
}

export default async function EquipmentKnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();

  const [documents, links, candidates, lifecycles] = await Promise.all([
    getDocumentsForAsset(id, session.user.id),
    getComponentDocumentLinks(id, session.user.id),
    getEquipmentCandidates(id, session.user.id),
    getComponentLifecycles(id, session.user.id),
  ]);

  const lifecycleByComponent = new Map(lifecycles.map((item) => [item.componentId, item]));
  const components = asset.systems.flatMap((system) =>
    system.components.map((component) => ({
      ...component,
      systemName: system.name,
      lifecycle: lifecycleByComponent.get(component.id) ?? { componentId: component.id, status: "installed" as const, changedOn: null, notes: null },
    })),
  );
  const installedComponents = components.filter((component) => component.lifecycle.status === "installed");
  const historicalComponents = components.filter((component) => component.lifecycle.status !== "installed");
  const pending = candidates.filter((candidate) => candidate.status === "pending");
  const manualComponentIds = new Set(links.filter((link) => link.relationship === "manual" || link.relationship === "service").map((link) => link.componentId));
  const sourceComponentIds = new Set(links.map((link) => link.componentId));
  const identified = installedComponents.filter((component) => component.manufacturer || component.model).length;

  const statusMessage = query?.status === "equipment-saved" ? "✓ Equipment changes saved."
    : query?.status === "equipment-deleted" ? "✓ Equipment record deleted."
    : query?.status === "lifecycle-installed" ? "✓ Equipment marked Installed."
    : query?.status === "lifecycle-removed_replaced" ? "✓ Equipment moved to Removed / Replaced history."
    : query?.status === "lifecycle-unknown" ? "✓ Equipment install status marked Unknown."
    : null;

  function equipmentCard(component: typeof components[number]) {
    const componentLinks = links.filter((link) => link.componentId === component.id);
    const hasManual = componentLinks.some((link) => link.relationship === "manual" || link.relationship === "service");
    const hasSource = sourceComponentIds.has(component.id);
    const identity = [component.manufacturer, component.model].filter(Boolean).join(" ");
    return (
      <article className="log-entry" key={component.id}>
        <div className="log-entry-meta">
          <span>{component.systemName}</span>
          <span>{lifecycleLabel(component.lifecycle.status)}</span>
        </div>
        <h3>{component.name}</h3>
        <p>{identity || "Manufacturer / model not recorded"}</p>
        {component.lifecycle.status === "installed" ? <p className="asset-summary">{hasManual ? "MANUAL COVERED" : hasSource ? "SOURCE VERIFIED · NEEDS MANUAL" : "NEEDS DOCUMENTATION"}</p> : null}
        {component.lifecycle.changedOn ? <p><strong>Lifecycle date:</strong> {component.lifecycle.changedOn}</p> : null}
        {component.lifecycle.notes ? <p><strong>Lifecycle note:</strong> {component.lifecycle.notes}</p> : null}

        <details className="editor-card">
          <summary>Edit equipment</summary>
          <form className="compact-form" action={editEquipment.bind(null, id, component.systemId, component.id)}>
            <label>Name<input name="name" required defaultValue={component.name} /></label>
            <label>Manufacturer<input name="manufacturer" defaultValue={component.manufacturer} /></label>
            <label>Model<input name="model" defaultValue={component.model} /></label>
            <label>Serial number<input name="serialNumber" defaultValue={component.serialNumber ?? ""} /></label>
            <label>Installed location<input name="location" defaultValue={component.location} /></label>
            <label>Notes<textarea name="notes" rows={3} defaultValue={component.notes} /></label>
            <button className="primary-button" type="submit">Save equipment changes</button>
          </form>
        </details>

        <details className="editor-card">
          <summary>Lifecycle / replacement history</summary>
          <p className="asset-summary">Use lifecycle status instead of deleting old equipment when you want Ernest to remember prior manuals, service records, and photos without treating the item as currently installed.</p>
          <form className="compact-form" action={changeEquipmentLifecycle.bind(null, id, component.id)}>
            <label>Status
              <select name="lifecycleStatus" defaultValue={component.lifecycle.status}>
                <option value="installed">Installed</option>
                <option value="removed_replaced">Removed / replaced</option>
                <option value="unknown">Install status unknown</option>
              </select>
            </label>
            <label>Date changed <span>(optional)</span><input name="lifecycleChangedOn" type="date" defaultValue={component.lifecycle.changedOn ?? ""} /></label>
            <label>Lifecycle note <span>(optional)</span><textarea name="lifecycleNotes" rows={2} defaultValue={component.lifecycle.notes ?? ""} placeholder="Example: Replaced by new charger; old manual retained for history." /></label>
            <button className="primary-button" type="submit">Save lifecycle</button>
          </form>
        </details>

        {componentLinks.map((link) => (
          <p key={`${link.componentId}:${link.documentId}`}>
            <Link href={`/assets/${id}/documents/${link.documentId}`}>{link.documentTitle}</Link> · {link.relationship}{" "}
            <form style={{ display: "inline" }} action={unlinkEquipmentDocument.bind(null, id, component.id, link.documentId)}>
              <button className="text-button">Unlink</button>
            </form>
          </p>
        ))}
        {documents.length ? (
          <details className="editor-card">
            <summary>Link an existing document</summary>
            <form className="compact-form" action={linkEquipmentDocument.bind(null, id)}>
              <input type="hidden" name="componentId" value={component.id} />
              <label>Document<select name="documentId" required defaultValue=""><option value="" disabled>Select a document</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label>
              <label>Relationship<select name="relationship" defaultValue="manual"><option value="manual">Manual</option><option value="service">Service document</option><option value="reference">Reference</option><option value="other">Other</option></select></label>
              <button className="primary-button">Link document</button>
            </form>
          </details>
        ) : null}

        <details className="editor-card">
          <summary>Delete equipment permanently</summary>
          <p className="asset-summary">Prefer Removed / Replaced for real historical equipment. Permanent delete is for mistakes or duplicate records and removes equipment links.</p>
          <form className="compact-form" action={deleteEquipment.bind(null, id, component.systemId, component.id)}>
            <label><span>Confirm deletion</span><select name="confirm" required defaultValue=""><option value="" disabled>Choose…</option><option value="yes">Delete {component.name}</option></select></label>
            <button className="text-button" type="submit">Delete equipment permanently</button>
          </form>
        </details>
      </article>
    );
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">E</span>Ernest</Link>
        <AccountMenu email={session.user.email} />
      </header>
      <main className="page-wrap detail-wrap">
        <Link className="back-link" href={`/assets/${id}`}>← {asset.name}</Link>
        {statusMessage ? <p className="operation-status">{statusMessage}</p> : null}
        <section className="asset-header">
          <div>
            <p className="eyebrow">Equipment memory</p>
            <div className="title-row"><h1>Equipment</h1><span className="type-pill">v0.8</span></div>
            <p className="asset-summary detail-summary">Keep current equipment accurate without losing the historical record when gear is replaced or its install status is uncertain.</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Installed</dt><dd>{installedComponents.length}</dd></div>
            <div><dt>Historical / unknown</dt><dd>{historicalComponents.length}</dd></div>
            <div><dt>Pending review</dt><dd>{pending.length}</dd></div>
          </dl>
        </section>

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Evidence intake</p><h2>Discover from documents</h2><p>Scanning creates review candidates only. Ernest does not promote document text into verified equipment until you approve it.</p></div>
          {documents.length === 0 ? <p className="empty-log">No documents are available to scan yet.</p> : <div className="log-list">{documents.map((document) => <article className="log-entry" key={document.id}><div className="log-entry-meta"><span>{document.extractedAt ? "READY" : "NOT EXTRACTED"}</span><span>{document.pageCount ?? 0} pages</span></div><h3>{document.title}</h3><p>{document.originalFilename}</p>{document.extractedAt ? <form action={scanDocumentForEquipment.bind(null, id, document.id)}><button className="primary-button" type="submit">Scan for equipment</button></form> : <p className="asset-summary">Extract this document before scanning it for equipment.</p>}</article>)}</div>}
        </section>

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Review</p><h2>Equipment candidates</h2><p>{pending.length} candidate{pending.length === 1 ? "" : "s"} waiting for verification.</p></div>
          {pending.length === 0 ? <p className="empty-log">No equipment candidates are waiting for review.</p> : <div className="log-list">{pending.map((candidate) => <article className="log-entry" key={candidate.id}><div className="log-entry-meta"><span>CANDIDATE</span><span>{candidate.documentTitle} · p. {candidate.pageNumber}</span></div><h3>{candidate.name}</h3><p>{[candidate.manufacturer, candidate.model].filter(Boolean).join(" ") || "Manufacturer / model not stated"}</p><details className="editor-card" open><summary>Verify installed equipment</summary><form className="compact-form" action={approveEquipment.bind(null, id, candidate.id)}>{asset.systems.length ? <label>Use existing system <span>(optional)</span><select name="systemId" defaultValue=""><option value="">Create/use category below</option>{asset.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select></label> : null}<label>System / category<input name="newSystemName" defaultValue={candidate.systemHint ?? ""} /></label><label>Name<input name="name" required defaultValue={candidate.name} /></label><label>Manufacturer<input name="manufacturer" defaultValue={candidate.manufacturer ?? ""} /></label><label>Model<input name="model" defaultValue={candidate.model ?? ""} /></label><label>Serial number<input name="serialNumber" defaultValue={candidate.serialNumber ?? ""} /></label><label>Installed location<input name="location" defaultValue={candidate.location ?? ""} /></label><label>Notes<textarea name="notes" rows={3} defaultValue={candidate.notes ?? ""} /></label><button className="primary-button" type="submit">Approve and add equipment</button></form></details><form action={rejectEquipment.bind(null, id, candidate.id)}><button className="text-button" type="submit">Reject candidate</button></form></article>)}</div>}
        </section>

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Current state</p><h2>Installed equipment</h2><p>{installedComponents.length} installed components · {identified} with manufacturer or model identified.</p></div>
          {installedComponents.length === 0 ? <p className="empty-log">No equipment is currently marked Installed.</p> : <div className="log-list">{installedComponents.map(equipmentCard)}</div>}
        </section>

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Historical memory</p><h2>Removed, replaced & uncertain equipment</h2><p>These records stay searchable as history but should not be treated as proof of what is installed today.</p></div>
          {historicalComponents.length === 0 ? <p className="empty-log">No historical or uncertain equipment yet.</p> : <div className="log-list">{historicalComponents.map(equipmentCard)}</div>}
        </section>

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Maintenance evidence</p><h2>Evidence becomes a proposal, not a fact</h2><p>Document maintenance extraction already creates source-linked candidates that you approve, edit, or reject on the document page. This lifecycle work keeps old equipment evidence useful without making it current-install evidence.</p></div>
          <div className="editor-card"><p className="asset-summary">Photo evidence remains attached to the asset/equipment and private. Automatic interpretation of photos and data plates is intentionally deferred; Ernest will not infer maintenance work from a photo without an explicit review step.</p></div>
        </section>
      </main>
    </div>
  );
}
