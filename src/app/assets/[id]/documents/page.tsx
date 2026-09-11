import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { DocumentUploadPanel } from "@/components/document-upload-panel";
import { DocumentUrlImportForm } from "@/components/document-url-import-form";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function status(document: Awaited<ReturnType<typeof getDocumentsForAsset>>[number]) {
  if (document.extractionError) return "Needs attention · extraction failed";
  if (document.extractedAt) return `Ready · ${document.pageCount ?? 0} pages`;
  return "Needs processing";
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();
  const documents = await getDocumentsForAsset(id, session.user.id);
  const inbox = documents.filter((document) => !document.extractedAt || document.extractionError);
  const ready = documents.filter((document) => document.extractedAt && !document.extractionError);

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
        <AccountMenu email={session.user.email} />
      </header>
      <main className="page-wrap detail-wrap">
        <Link className="back-link" href={`/assets/${id}`}><span aria-hidden="true">←</span> {asset.name}</Link>
        <section className="asset-header">
          <div>
            <p className="eyebrow">Knowledge intake</p>
            <div className="title-row"><h1>Document Vault</h1><span className="type-pill">v0.8</span></div>
            <p className="asset-summary detail-summary">Put documents into Ernest first; organize and process them afterward. Originals remain private and unchanged in storage.</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Documents</dt><dd>{documents.length}</dd></div>
            <div><dt>Vault inbox</dt><dd>{inbox.length}</dd></div>
            <div><dt>Ready</dt><dd>{ready.length}</dd></div>
          </dl>
        </section>

        {query.saved === "deleted" ? <p className="write-result success">✓ Document deleted. The vault and search index have been updated.</p> : null}

        <DocumentUploadPanel assetId={id} />
        <DocumentUrlImportForm assetId={id} />

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">Vault inbox</p>
            <h2>Needs processing or review</h2>
            <p>{inbox.length ? `${inbox.length} document${inbox.length === 1 ? "" : "s"} can stay here until you are ready to process them.` : "Nothing is waiting. Your document inbox is clear."}</p>
          </div>
          {inbox.length === 0 ? <p className="empty-log">New uploads will appear here automatically. No classification is required during upload.</p> : (
            <div className="log-list">
              {inbox.map((document) => (
                <article className="log-entry vault-inbox-entry" key={document.id}>
                  <div className="log-entry-meta">
                    <span>{document.extractionError ? "NEEDS ATTENTION" : "NEW · NEEDS PROCESSING"}</span>
                    <time dateTime={document.createdAt.toISOString()}>{document.createdAt.toLocaleString()}</time>
                  </div>
                  <h3><Link href={`/assets/${id}/documents/${document.id}`}>{document.title}</Link></h3>
                  <p>{document.originalFilename}</p>
                  <small>{formatBytes(document.sizeBytes)} · {status(document)}</small>
                  <p><a href={`/assets/${id}/documents/${document.id}/original`} target="_blank" rel="noreferrer">Open preserved original ↗</a></p>
                  <Link className="edit-asset-link" href={`/assets/${id}/documents/${document.id}`}>{document.extractionError ? "Review problem →" : "Process document →"}</Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">Ready knowledge</p>
            <h2>Processed documents</h2>
            <p>{ready.length} {ready.length === 1 ? "document is" : "documents are"} searchable and available as source evidence.</p>
          </div>
          {ready.length === 0 ? (
            <p className="empty-log">No processed documents yet. Open an item in the vault inbox when you are ready to extract it.</p>
          ) : (
            <div className="log-list">
              {ready.map((document) => (
                <article className="log-entry" key={document.id}>
                  <div className="log-entry-meta">
                    <span>{document.sourceType === "url" ? "URL" : "UPLOAD"}</span>
                    <time dateTime={document.createdAt.toISOString()}>{document.createdAt.toLocaleString()}</time>
                  </div>
                  <h3><Link href={`/assets/${id}/documents/${document.id}`}>{document.title}</Link></h3>
                  <p>{document.originalFilename}</p>
                  <small>{formatBytes(document.sizeBytes)} · {status(document)}</small>
                  <p>
                    <a href={`/assets/${id}/documents/${document.id}/original`} target="_blank" rel="noreferrer">Open original PDF ↗</a>
                    {document.sourceUrl ? <> · <a href={document.sourceUrl} target="_blank" rel="noreferrer">Original web source ↗</a></> : null}
                  </p>
                  <Link className="edit-asset-link" href={`/assets/${id}/documents/${document.id}`}>Manage document →</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
