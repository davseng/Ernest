import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { getAsset } from "@/data/assets";
import { getDocumentForAsset, getDocumentPages } from "@/data/documents";
import { removeDocument, renameDocument } from "../../document-actions";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentDetailPage({ params }: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id, documentId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();
  const document = await getDocumentForAsset(documentId, id, session.user.id);
  if (!document) notFound();
  const pages = await getDocumentPages(documentId, id, session.user.id) ?? [];
  const blankPages = pages.filter((page) => !page.text.trim()).length;

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
        <AccountMenu email={session.user.email} />
      </header>
      <main className="page-wrap detail-wrap">
        <Link className="back-link" href={`/assets/${id}/documents`}><span aria-hidden="true">←</span> Document Library</Link>
        <section className="asset-header">
          <div>
            <p className="eyebrow">Document</p>
            <div className="title-row"><h1>{document.title}</h1><span className="type-pill">PDF</span></div>
            <p className="asset-summary detail-summary">{document.originalFilename}</p>
          </div>
          <dl className="asset-facts">
            <div><dt>Size</dt><dd>{formatBytes(document.sizeBytes)}</dd></div>
            <div><dt>Source</dt><dd>{document.sourceType === "url" ? "URL" : "Upload"}</dd></div>
            <div><dt>Pages</dt><dd>{document.pageCount ?? "—"}</dd></div>
            <div><dt>Status</dt><dd>{document.extractionError ? "Extraction failed" : document.extractedAt ? "Ready" : "Not extracted"}</dd></div>
          </dl>
        </section>

        {document.sourceUrl ? (
          <p><a className="edit-asset-link" href={document.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a></p>
        ) : null}

        <section className="systems-section">
          <div className="section-heading"><p className="eyebrow">Manage</p><h2>Document controls</h2></div>
          <div className="log-layout">
            <form className="compact-form" action={renameDocument.bind(null, id, documentId)}>
              <h3>Rename</h3>
              <label>Title<input name="title" defaultValue={document.title} maxLength={200} required /></label>
              <button className="primary-button" type="submit">Save title</button>
            </form>
            <div className="compact-form">
              <h3>Text processing</h3>
              <p>{document.extractedAt ? `Last extracted ${document.extractedAt.toLocaleString()}.` : "Text has not been extracted yet."}</p>
              {document.extractionError ? <p className="error-notice">{document.extractionError}</p> : null}
              <form action={`/assets/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/extract`} method="post">
                <button className="primary-button" type="submit">{document.extractedAt ? "Re-extract text" : "Extract text"}</button>
              </form>
            </div>
          </div>
          <details className="editor-card">
            <summary>Delete document</summary>
            <p>This removes the private PDF plus its extracted pages and search chunks. This cannot be undone.</p>
            <form action={removeDocument.bind(null, id, documentId)}>
              <button className="delete-button" type="submit">Delete document</button>
            </form>
          </details>
        </section>

        <section className="systems-section">
          <div className="section-heading">
            <p className="eyebrow">What Ernest knows</p>
            <h2>Extracted text</h2>
            <p>{pages.length} pages · {blankPages} blank</p>
          </div>
          {pages.length === 0 ? (
            <p className="empty-log">No extracted text is available. Run extraction above. Image-only PDFs will remain blank until OCR fallback is added.</p>
          ) : (
            <div className="log-list">
              {pages.map((page) => (
                <article className="log-entry" key={page.pageNumber}>
                  <div className="log-entry-meta"><span>PAGE {page.pageNumber}</span></div>
                  {page.text.trim() ? <pre className="document-text-page">{page.text}</pre> : <p className="empty-log">No machine-readable text found on this page.</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
