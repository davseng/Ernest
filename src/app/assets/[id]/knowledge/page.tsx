import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";
import { getComponentDocumentLinks } from "@/data/equipment-knowledge";
import { linkEquipmentDocument, unlinkEquipmentDocument } from "../knowledge-actions";

export const dynamic = "force-dynamic";

export default async function EquipmentKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();

  const [documents, links] = await Promise.all([
    getDocumentsForAsset(id, session.user.id),
    getComponentDocumentLinks(id, session.user.id),
  ]);

  const components = asset.systems.flatMap((system) =>
    system.components.map((component) => ({ ...component, systemName: system.name })),
  );
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
            <p className="asset-summary detail-summary">Track which installed components are identified and which documents Ernest can trust for each one.</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Components</dt><dd>{components.length}</dd></div>
            <div><dt>Identified</dt><dd>{identified}</dd></div>
            <div><dt>With linked docs</dt><dd>{linkedComponentIds.size}</dd></div>
          </dl>
        </section>

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">Coverage</p>
            <h2>Installed equipment</h2>
            <p>Link manuals and references only when they match the installed equipment. Missing manufacturer/model data is a knowledge gap, not something Ernest should guess.</p>
          </div>

          {components.length === 0 ? <p className="empty-log">No components are recorded yet.</p> : (
            <div className="log-list">
              {components.map((component) => {
                const componentLinks = links.filter((link) => link.componentId === component.id);
                const identity = [component.manufacturer, component.model].filter(Boolean).join(" ");
                return (
                  <article className="log-entry" key={component.id}>
                    <div className="log-entry-meta"><span>{component.systemName}</span><span>{componentLinks.length ? "DOCUMENTED" : "NEEDS DOCUMENT"}</span></div>
                    <h3>{component.name}</h3>
                    <p>{identity || "Manufacturer / model not recorded"}</p>
                    {component.serialNumber ? <p><strong>Serial:</strong> {component.serialNumber}</p> : null}
                    {component.location ? <p><strong>Installed location:</strong> {component.location}</p> : null}
                    {component.notes ? <p><strong>Notes:</strong> {component.notes}</p> : null}

                    {componentLinks.length ? <div>
                      <strong>Linked knowledge</strong>
                      {componentLinks.map((link) => (
                        <p key={`${link.componentId}:${link.documentId}`}>
                          <Link href={`/assets/${id}/documents/${link.documentId}`}>{link.documentTitle}</Link> · {link.relationship}
                          {" "}
                          <form style={{ display: "inline" }} action={unlinkEquipmentDocument.bind(null, id, component.id, link.documentId)}>
                            <button className="text-button">Unlink</button>
                          </form>
                        </p>
                      ))}
                    </div> : <p className="asset-summary">No manual or reference linked yet.</p>}

                    {documents.length ? (
                      <details className="editor-card">
                        <summary>Link an existing document</summary>
                        <form className="compact-form" action={linkEquipmentDocument.bind(null, id)}>
                          <input type="hidden" name="componentId" value={component.id} />
                          <label>Document
                            <select name="documentId" required defaultValue="">
                              <option value="" disabled>Select a document</option>
                              {documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
                            </select>
                          </label>
                          <label>Relationship
                            <select name="relationship" defaultValue="manual">
                              <option value="manual">Manual</option>
                              <option value="service">Service document</option>
                              <option value="reference">Reference</option>
                              <option value="other">Other</option>
                            </select>
                          </label>
                          <button className="primary-button">Link document</button>
                        </form>
                      </details>
                    ) : <p className="asset-summary"><Link href={`/assets/${id}/documents`}>Add documents to the library first →</Link></p>}
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
