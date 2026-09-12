import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AssetAppHeader } from "@/components/asset-app-header";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";
import { getEquipmentCandidates } from "@/data/equipment-candidates";
import { getComponentDocumentLinks, getComponentLifecycles } from "@/data/equipment-knowledge";
import { approveEquipment, rejectEquipment, scanDocumentForEquipment } from "../knowledge-actions";

export const dynamic = "force-dynamic";

function lifecycleLabel(status: "installed" | "removed_replaced" | "unknown") {
  if (status === "removed_replaced") return "Removed / replaced";
  if (status === "unknown") return "Unknown";
  return "Installed";
}

export default async function EquipmentKnowledgePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; q?: string; lifecycle?: string }>;
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
  const components = asset.systems.flatMap((system) => system.components.map((component) => ({
    ...component,
    systemName: system.name,
    lifecycle: lifecycleByComponent.get(component.id) ?? { componentId: component.id, status: "installed" as const, changedOn: null, notes: null },
  })));
  const pending = candidates.filter((candidate) => candidate.status === "pending");
  const sourceComponentIds = new Set(links.map((link) => link.componentId));
  const manualComponentIds = new Set(links.filter((link) => link.relationship === "manual" || link.relationship === "service").map((link) => link.componentId));

  const search = (query?.q ?? "").trim().toLowerCase();
  const lifecycleFilter = query?.lifecycle === "removed_replaced" || query?.lifecycle === "unknown" || query?.lifecycle === "all" ? query.lifecycle : "installed";
  const filtered = components.filter((component) => {
    const lifecycleMatch = lifecycleFilter === "all" || component.lifecycle.status === lifecycleFilter;
    const searchMatch = !search || [component.name, component.manufacturer, component.model, component.serialNumber, component.location, component.systemName, component.notes]
      .filter(Boolean).join(" ").toLowerCase().includes(search);
    return lifecycleMatch && searchMatch;
  });

  const statusMessage = query?.status === "equipment-saved" ? "✓ Equipment changes saved."
    : query?.status === "equipment-deleted" ? "✓ Equipment record deleted."
    : query?.status?.startsWith("lifecycle-") ? "✓ Equipment lifecycle updated."
    : null;

  return (
    <div className="app-shell">
      <AssetAppHeader assetId={id} assetName={asset.name} email={session.user.email} />
      <main className="page-wrap detail-wrap equipment-registry-page">
        {statusMessage ? <p className="operation-status" role="status">{statusMessage}</p> : null}
        <section className="asset-header">
          <div>
            <p className="eyebrow">Equipment</p>
            <div className="title-row"><h1>What&apos;s installed</h1><span className="type-pill">{components.length} records</span></div>
            <p className="asset-summary detail-summary">Browse the equipment Ernest knows about. Open a record to make changes, manage lifecycle, or link evidence.</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Installed</dt><dd>{components.filter((item) => item.lifecycle.status === "installed").length}</dd></div>
            <div><dt>History / unknown</dt><dd>{components.filter((item) => item.lifecycle.status !== "installed").length}</dd></div>
            <div><dt>Review</dt><dd>{pending.length}</dd></div>
          </dl>
        </section>

        <section className="equipment-toolbar" aria-label="Equipment filters">
          <form method="get" className="equipment-search-form">
            <label>Search equipment<input name="q" defaultValue={query?.q ?? ""} placeholder="engine, AIS, charger, serial…" /></label>
            <label>Status<select name="lifecycle" defaultValue={lifecycleFilter}><option value="installed">Installed</option><option value="removed_replaced">Removed / replaced</option><option value="unknown">Unknown</option><option value="all">All equipment</option></select></label>
            <button className="primary-button" type="submit">Apply</button>
            {(search || lifecycleFilter !== "installed") ? <Link className="secondary-action" href={`/assets/${id}/knowledge`}>Reset</Link> : null}
          </form>
        </section>

        <section className="systems-section equipment-registry-section">
          <div className="section-heading"><p className="eyebrow">Registry</p><h2>{filtered.length} result{filtered.length === 1 ? "" : "s"}</h2></div>
          {filtered.length === 0 ? <p className="empty-log">No equipment matches those filters.</p> : (
            <div className="equipment-registry-grid">
              {filtered.map((component) => {
                const identity = [component.manufacturer, component.model].filter(Boolean).join(" ");
                const evidence = manualComponentIds.has(component.id) ? "Manual/service linked" : sourceComponentIds.has(component.id) ? "Source linked" : "Needs documentation";
                return <Link className="equipment-registry-card" href={`/assets/${id}/knowledge/${component.id}`} key={component.id}>
                  <div className="equipment-registry-card-top"><span>{component.systemName}</span><span>{lifecycleLabel(component.lifecycle.status)}</span></div>
                  <h3>{component.name}</h3>
                  <p>{identity || "Manufacturer / model not recorded"}</p>
                  {component.location ? <small>{component.location}</small> : null}
                  <div className="equipment-registry-card-bottom"><span>{evidence}</span><strong>Open →</strong></div>
                </Link>;
              })}
            </div>
          )}
        </section>

        <section className="systems-section secondary-tools-section">
          <details className="management-tool-card" open={pending.length > 0}>
            <summary><span>Review equipment candidates</span><strong>{pending.length}</strong></summary>
            <div className="management-tool-body">
              <p>Document scans create candidates only. Nothing becomes verified equipment until you approve it.</p>
              {pending.length === 0 ? <p className="empty-log">No candidates are waiting.</p> : <div className="log-list">{pending.map((candidate) => <article className="log-entry" key={candidate.id}>
                <div className="log-entry-meta"><span>CANDIDATE</span><span>{candidate.documentTitle} · p. {candidate.pageNumber}</span></div>
                <h3>{candidate.name}</h3>
                <p>{[candidate.manufacturer, candidate.model].filter(Boolean).join(" ") || "Manufacturer / model not stated"}</p>
                <details className="editor-card touch-editor"><summary>Review candidate</summary><form className="compact-form" action={approveEquipment.bind(null, id, candidate.id)}>
                  {asset.systems.length ? <label>Existing system<select name="systemId" defaultValue=""><option value="">Create/use category below</option>{asset.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select></label> : null}
                  <label>System / category<input name="newSystemName" defaultValue={candidate.systemHint ?? ""} /></label>
                  <label>Name<input name="name" required defaultValue={candidate.name} /></label>
                  <label>Manufacturer<input name="manufacturer" defaultValue={candidate.manufacturer ?? ""} /></label>
                  <label>Model<input name="model" defaultValue={candidate.model ?? ""} /></label>
                  <label>Serial number<input name="serialNumber" defaultValue={candidate.serialNumber ?? ""} /></label>
                  <label>Installed location<input name="location" defaultValue={candidate.location ?? ""} /></label>
                  <label>Notes<textarea name="notes" rows={3} defaultValue={candidate.notes ?? ""} /></label>
                  <button className="primary-button" type="submit">Approve equipment</button>
                </form></details>
                <form action={rejectEquipment.bind(null, id, candidate.id)}><button className="secondary-action" type="submit">Reject candidate</button></form>
              </article>)}</div>}
            </div>
          </details>

          <details className="management-tool-card">
            <summary><span>Discover equipment from documents</span><strong>{documents.filter((document) => document.extractedAt).length}</strong></summary>
            <div className="management-tool-body">
              <p>Scan an extracted document when you want Ernest to propose equipment for review.</p>
              {documents.length === 0 ? <p className="empty-log">No documents are available.</p> : <div className="log-list">{documents.map((document) => <article className="log-entry" key={document.id}>
                <div className="log-entry-meta"><span>{document.extractedAt ? "READY" : "NOT EXTRACTED"}</span><span>{document.pageCount ?? 0} pages</span></div>
                <h3>{document.title}</h3>
                {document.extractedAt ? <form action={scanDocumentForEquipment.bind(null, id, document.id)}><button className="primary-button" type="submit">Scan for equipment</button></form> : <p className="asset-summary">Process this document first.</p>}
              </article>)}</div>}
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
