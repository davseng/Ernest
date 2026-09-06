import Link from "next/link";

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
}: {
  documents: AssetDocument[];
  error?: string;
  uploadAction: (formData: FormData) => void | Promise<void>;
}) {
  const assetId = documents[0]?.assetId;
  return (
    <section className="systems-section" id="documents">
      <div className="section-heading">
        <p className="eyebrow">Knowledge</p>
        <h2>Documents</h2>
        <p>{documents.length} {documents.length === 1 ? "document" : "documents"}</p>
      </div>
      <ErrorNotice message={error} />
      {assetId ? <Link className="primary-button" href={`/assets/${assetId}/documents`}>Open Document Library</Link> : null}
      {documents.length === 0 ? (
        <p className="empty-log">No documents yet. Open the Document Library to add a manual, survey, invoice, or service record.</p>
      ) : (
        <div className="log-list">
          {documents.slice(0, 3).map((document) => (
            <article className="log-entry" key={document.id}>
              <div className="log-entry-meta">
                <span>{document.sourceType === "url" ? "URL" : "PDF"}</span>
                <time dateTime={document.createdAt.toISOString()}>{document.createdAt.toLocaleString()}</time>
              </div>
              <h3><Link href={`/assets/${document.assetId}/documents/${document.id}`}>{document.title}</Link></h3>
              <p>{document.originalFilename}</p>
              <small>{formatBytes(document.sizeBytes)} · {extractionStatus(document)}</small>
            </article>
          ))}
          {documents.length > 3 && assetId ? <Link className="edit-asset-link" href={`/assets/${assetId}/documents`}>View all {documents.length} documents →</Link> : null}
        </div>
      )}
    </section>
  );
}
