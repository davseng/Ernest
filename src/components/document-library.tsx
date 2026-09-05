import type { AssetDocument } from "@/domain/documents";
import { ErrorNotice } from "@/components/error-notice";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractionStatus(document: AssetDocument) {
  if (document.extractionError) return "Extraction failed";
  if (document.extractedAt) return `Extracted · ${document.pageCount ?? 0} pages`;
  return "Not extracted";
}

export function DocumentLibrary({
  documents,
  error,
  uploadAction,
}: {
  documents: AssetDocument[];
  error?: string;
  uploadAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <section className="systems-section" id="documents">
      <div className="section-heading">
        <p className="eyebrow">Knowledge</p>
        <h2>Documents</h2>
        <p>{documents.length} {documents.length === 1 ? "document" : "documents"}</p>
      </div>
      <ErrorNotice message={error} />
      <details className="editor-card add-system">
        <summary>Upload a PDF</summary>
        <form className="compact-form" action={uploadAction}>
          <label>Title<input name="title" maxLength={200} required /></label>
          <label>PDF<input name="file" type="file" accept="application/pdf,.pdf" required /></label>
          <p>PDF only · maximum 20 MB. The original file is stored unchanged.</p>
          <button className="primary-button" type="submit">Upload document</button>
        </form>
      </details>
      {documents.length === 0 ? (
        <p className="empty-log">No documents yet. Add a manual, survey, invoice, or service record.</p>
      ) : (
        <div className="log-list">
          {documents.map((document) => (
            <article className="log-entry" key={document.id}>
              <div className="log-entry-meta">
                <span>PDF</span>
                <time dateTime={document.createdAt.toISOString()}>{document.createdAt.toLocaleString()}</time>
              </div>
              <h3>{document.title}</h3>
              <p>{document.originalFilename}</p>
              <small>{formatBytes(document.sizeBytes)} · {extractionStatus(document)}</small>
              <form action={`/assets/${encodeURIComponent(document.assetId)}/documents/${encodeURIComponent(document.id)}/extract`} method="post">
                <button className="primary-button" type="submit">
                  {document.extractedAt ? "Re-extract text" : "Extract text"}
                </button>
              </form>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
