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
  if (document.extractionError) return "Extraction failed";
  if (document.extractedAt) return `Extracted · ${document.pageCount ?? 0} pages`;
  return "Not extracted";
}

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();
  const documents = await getDocumentsForAsset(id, session.user.id);

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
            <p className="eyebrow">Knowledge</p>
            <div className="title-row"><h1>Document Library</h1><span className="type-pill">v0.2</span></div>
            <p className="asset-summary detail-summary">Add, inspect, reprocess, rename, and remove the documents Ernest uses for {asset.name}.</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Documents</dt><dd>{documents.length}</dd></div>
            <div><dt>Ready</dt><dd>{documents.filter((document) => document.extractedAt).length}</dd></div>
            <div><dt>Needs attention</dt><dd>{documents.filter((document) => document.extractionError).length}</dd></div>
          </dl>
        </section>

        <DocumentUploadPanel assetId={id} />
        <DocumentUrlImportForm assetId={id} />

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">Library</p>
            <h2>Documents</h2>
            <p>{documents.length} {documents.length === 1 ? "document" : "documents"}</p>
          </div>
          {documents.length === 0 ? (
            <p className="empty-log">No documents yet. Add a manual, survey, invoice, listing, or service record.</p>
          ) : (
            <div className="log-list">
              {documents.map((document) => (
                <article className="log-entry" key={document.id}>
                  <div className="log-entry-meta">
                    <span>{document.sourceType === "url" ? "URL" : "UPLOAD"}</span>
                    <time dateTime={document.createdAt.toISOString()}>{document.createdAt.toLocaleString()}</time>
                  </div>
                  <h3><Link href={`/assets/${id}/documents/${document.id}`}>{document.title}</Link></h3>
                  <p>{document.originalFilename}</p>
                  <small>{formatBytes(document.sizeBytes)} · {status(document)}</small>
                  {document.sourceUrl ? <p><a href={document.sourceUrl} target="_blank" rel="noreferrer">Original source</a></p> : null}
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
