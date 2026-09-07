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
  const linkedComponentIds = new Set(links.map((link) => link.componentId));
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
            <p className="eyebrow">Knowledge acquisition</p>
            <div className="title-row"><h1>Equipment Knowledge</h1><span className="type-pill">v0.5</span></div>
            <p className="asset-summary detail-summary">Discover equipment from your documents, verify what is actually installed, then link the right manuals and references.</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Verified components</dt><dd>{components.length}</dd></div>
            <div><dt>Pending review</dt><dd>{pending.length}</dd></div>
            <div><dt>With linked docs</dt><dd>{linkedComponentIds.size}</dd></div>
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

                  {asset.systems.length ? (
                    <details className="editor-card" open>
                      <summary>Verify installed equipment</summary>
                      <form className="compact-form" action={approveEquipment.bind(null, id, candidate.id)}>
                        <label>System
                          <select name="systemId" required defaultValue="">
                            <option value="" disabled>Select a verified system</option>
                            {asset.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
                          </select>
                        </label>
                        <label>Name<input name="name" required defaultValue={candidate.name} /></label>
                        <label>Manufacturer<input name="manufacturer" defaultValue={candidate.manufacturer ?? ""} /></label>
                        <label>Model<input name="model" defaultValue={candidate.model ?? ""} /></label>
                        <label>Serial number<input name="serialNumber" defaultValue={candidate.serialNumber ?? ""} /></label>
                        <label>Installed location<input name="location" defaultValue={candidate.location ?? ""} /></label>
                        <label>Notes<textarea name="notes" rows={3} defaultValue={candidate.notes ?? ""} /></label>
                        <button className="primary-button" type="submit">Verify and add component</button>
                      </form>
                    </details>
                  ) : <p className="asset-summary">Add a system on the Asset page before approving this candidate.</p>}
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
                const identity = [component.manufacturer, component.model].filter(Boolean).join(" ");
                return (
                  <article className="log-entry" key={component.id}>
                    <div className="log-entry-meta"><span>{component.systemName}</span><span>{componentLinks.length ? "DOCUMENTED" : "NEEDS DOCUMENT"}</span></div>
                    <h3>{component.name}</h3>
                    <p>{identity || "Manufacturer / model not recorded"}</p>
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
