import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";
import { getEquipmentCandidates } from "@/data/equipment-candidates";
import { getComponentDocumentLinks } from "@/data/equipment-knowledge";
import {
  approveEquipment,
  deleteEquipment,
  editEquipment,
  linkEquipmentDocument,
  rejectEquipment,
  scanDocumentForEquipment,
  unlinkEquipmentDocument,
} from "../knowledge-actions";

export const dynamic = "force-dynamic";

export default async function EquipmentKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();

  const [documents, links, candidates] = await Promise.all([
    getDocumentsForAsset(id, session.user.id),
    getComponentDocumentLinks(id, session.user.id),
    getEquipmentCandidates(id, session.user.id),
  ]);

  const components = asset.systems.flatMap((system) =>
    system.components.map((component) => ({ ...component, systemName: system.name })),
  );
  const pending = candidates.filter((candidate) => candidate.status === "pending");
  const manualComponentIds = new Set(links.filter((link) => link.relationship === "manual" || link.relationship === "service").map((link) => link.componentId));
  const sourceComponentIds = new Set(links.map((link) => link.componentId));
  const identified = components.filter((component) => component.manufacturer || component.model).length;

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark">E</span>Ernest</Link>
        <AccountMenu email={session.user.email} />
      </header>
      <main className="page-wrap detail-wrap">
        <Link className="back-link" href={`/assets/${id}`}>← {asset.name}</Link>
        <section className="asset-header">
          <div>
            <p className="eyebrow">Installed equipment</p>
            <div className="title-row"><h1>Equipment</h1><span className="type-pill">v0.8</span></div>
            <p className="asset-summary detail-summary">Keep the installed equipment record accurate, connect it to source documents, and review equipment discovered from evidence.</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Verified components</dt><dd>{components.length}</dd></div>
            <div><dt>Pending review</dt><dd>{pending.length}</dd></div>
            <div><dt>With manuals/service docs</dt><dd>{manualComponentIds.size}</dd></div>
          </dl>
        </section>

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">Step 1</p>
            <h2>Discover from documents</h2>
            <p>Scanning creates review candidates only. Ernest does not promote document text into verified equipment until you approve it.</p>
          </div>
          {documents.length === 0 ? <p className="empty-log">No documents are available to scan yet.</p> : (
            <div className="log-list">
              {documents.map((document) => (
                <article className="log-entry" key={document.id}>
                  <div className="log-entry-meta"><span>{document.extractedAt ? "READY" : "NOT EXTRACTED"}</span><span>{document.pageCount ?? 0} pages</span></div>
                  <h3>{document.title}</h3>
                  <p>{document.originalFilename}</p>
                  {document.extractedAt ? (
                    <form action={scanDocumentForEquipment.bind(null, id, document.id)}>
                      <button className="primary-button" type="submit">Scan for equipment</button>
                    </form>
                  ) : <p className="asset-summary">Extract this document before scanning it for equipment.</p>}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">Step 2</p>
            <h2>Review candidates</h2>
            <p>{pending.length} candidate{pending.length === 1 ? "" : "s"} waiting for verification.</p>
          </div>
          {pending.length === 0 ? <p className="empty-log">No equipment candidates are waiting for review. Scan one of the extracted documents above.</p> : (
            <div className="log-list">
              {pending.map((candidate) => (
                <article className="log-entry" key={candidate.id}>
                  <div className="log-entry-meta"><span>CANDIDATE</span><span>{candidate.documentTitle} · p. {candidate.pageNumber}</span></div>
                  <h3>{candidate.name}</h3>
                  <p>{[candidate.manufacturer, candidate.model].filter(Boolean).join(" ") || "Manufacturer / model not stated"}</p>
                  {candidate.systemHint ? <p><strong>Suggested category:</strong> {candidate.systemHint}</p> : null}
                  {candidate.location ? <p><strong>Source location:</strong> {candidate.location}</p> : null}
                  {candidate.notes ? <p><strong>Source note:</strong> {candidate.notes}</p> : null}

                  <details className="editor-card" open>
                    <summary>Verify installed equipment</summary>
                    <form className="compact-form" action={approveEquipment.bind(null, id, candidate.id)}>
                      {asset.systems.length ? (
                        <label>Use existing system <span>(optional)</span>
                          <select name="systemId" defaultValue="">
                            <option value="">Create/use category below</option>
                            {asset.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
                          </select>
                        </label>
                      ) : null}
                      <label>System / category
                        <input name="newSystemName" defaultValue={candidate.systemHint ?? ""} placeholder="e.g. Propulsion, Navigation, Refrigeration" />
                      </label>
                      <p className="asset-summary">Choose an existing system above, or leave it blank and Ernest will create/reuse the category you enter here when you approve this item.</p>
                      <label>Name<input name="name" required defaultValue={candidate.name} /></label>
                      <label>Manufacturer<input name="manufacturer" defaultValue={candidate.manufacturer ?? ""} /></label>
                      <label>Model<input name="model" defaultValue={candidate.model ?? ""} /></label>
                      <label>Serial number<input name="serialNumber" defaultValue={candidate.serialNumber ?? ""} /></label>
                      <label>Installed location<input name="location" defaultValue={candidate.location ?? ""} /></label>
                      <label>Notes<textarea name="notes" rows={3} defaultValue={candidate.notes ?? ""} /></label>
                      <button className="primary-button" type="submit">Approve and add equipment</button>
                    </form>
                  </details>
                  <form action={rejectEquipment.bind(null, id, candidate.id)}>
                    <button className="text-button" type="submit">Reject candidate</button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">Step 3</p>
            <h2>Verified installed equipment</h2>
            <p>{components.length} verified components · {identified} with manufacturer or model identified.</p>
          </div>
          {components.length === 0 ? <p className="empty-log">No verified components yet. Approve candidates above to build the equipment registry.</p> : (
            <div className="log-list">
              {components.map((component) => {
                const componentLinks = links.filter((link) => link.componentId === component.id);
                const hasManual = componentLinks.some((link) => link.relationship === "manual" || link.relationship === "service");
                const hasSource = sourceComponentIds.has(component.id);
                const identity = [component.manufacturer, component.model].filter(Boolean).join(" ");
                return (
                  <article className="log-entry" key={component.id}>
                    <div className="log-entry-meta"><span>{component.systemName}</span><span>{hasManual ? "MANUAL COVERED" : hasSource ? "SOURCE VERIFIED · NEEDS MANUAL" : "NEEDS DOCUMENTATION"}</span></div>
                    <h3>{component.name}</h3>
                    <p>{identity || "Manufacturer / model not recorded"}</p>
                    {!component.manufacturer || !component.model ? <p><strong>Knowledge gap:</strong> manufacturer/model identity is incomplete.</p> : null}
                    {!hasManual ? <p><strong>Knowledge gap:</strong> no manual or service document is linked yet.</p> : null}

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
                      <summary>Delete equipment</summary>
                      <p className="asset-summary">This removes the installed-equipment record and its document links. The source documents themselves are kept.</p>
                      <form className="compact-form" action={deleteEquipment.bind(null, id, component.systemId, component.id)}>
                        <label><span>Confirm deletion</span><select name="confirm" required defaultValue=""><option value="" disabled>Choose…</option><option value="yes">Delete {component.name}</option></select></label>
                        <button className="text-button" type="submit">Delete equipment</button>
                      </form>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
