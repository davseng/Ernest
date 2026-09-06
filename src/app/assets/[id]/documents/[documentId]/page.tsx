import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { getAsset } from "@/data/assets";
import { getDocumentForAsset, getDocumentPages } from "@/data/documents";
import { getMaintenanceCandidates, getMaintenanceGuidance } from "@/data/maintenance-candidates";
import { removeDocument, renameDocument } from "../../document-actions";
import {
  approveMaintenanceCandidate,
  editAndApproveMaintenanceCandidate,
  generateMaintenanceCandidates,
  rejectMaintenanceCandidate,
} from "./maintenance-actions";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractionQuality(text: string) {
  const usefulCharacters = (text.replace(/\s+/g, " ").trim().match(/[A-Za-z0-9]/g) ?? []).length;
  if (usefulCharacters === 0) return { label: "No text", weak: true };
  if (usefulCharacters < 80) return { label: "Weak", weak: true };
  return { label: "Good", weak: false };
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();
  const document = await getDocumentForAsset(documentId, id, session.user.id);
  if (!document) notFound();
  const pages = await getDocumentPages(documentId, id, session.user.id) ?? [];
  const [candidates, guidance] = await Promise.all([
    getMaintenanceCandidates(documentId, id, session.user.id),
    getMaintenanceGuidance(documentId, id, session.user.id),
  ]);
  const pageQuality = pages.map((page) => ({ ...page, quality: extractionQuality(page.text) }));
  const weakPages = pageQuality.filter((page) => page.quality.weak).length;
  const pendingCount = candidates.filter((candidate) => candidate.status === "pending").length;

  return <div className="app-shell">
    <header className="site-header"><Link className="brand" href="/"><span className="brand-mark">E</span>Ernest</Link><AccountMenu email={session.user.email} /></header>
    <main className="page-wrap detail-wrap">
      <Link className="back-link" href={`/assets/${id}/documents`}>← Document Library</Link>
      <section className="asset-header"><div><p className="eyebrow">Document</p><div className="title-row"><h1>{document.title}</h1><span className="type-pill">PDF</span></div><p className="asset-summary detail-summary">{document.originalFilename}</p></div><dl className="asset-facts"><div><dt>Size</dt><dd>{formatBytes(document.sizeBytes)}</dd></div><div><dt>Source</dt><dd>{document.sourceType === "url" ? "URL" : "Upload"}</dd></div><div><dt>Pages</dt><dd>{document.pageCount ?? "—"}</dd></div><div><dt>Status</dt><dd>{document.extractionError ? "Extraction failed" : document.extractedAt ? "Ready" : "Not extracted"}</dd></div></dl></section>
      {document.sourceUrl ? <p><a className="edit-asset-link" href={document.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a></p> : null}

      <section className="systems-section"><div className="section-heading"><p className="eyebrow">Manage</p><h2>Document controls</h2></div><div className="log-layout">
        <form className="compact-form" action={renameDocument.bind(null,id,documentId)}><h3>Rename</h3><label>Title<input name="title" defaultValue={document.title} maxLength={200} required /></label><button className="primary-button">Save title</button></form>
        <div className="compact-form"><h3>Text processing</h3><p>{document.extractedAt ? `Last extracted ${document.extractedAt.toLocaleString()}.` : "Text has not been extracted yet."}</p>{document.extractedAt && weakPages > 0 ? <p className="error-notice">{weakPages} page{weakPages===1?"":"s"} still have weak or no readable text after extraction.</p>:null}{document.extractionError?<p className="error-notice">{document.extractionError}</p>:null}<form action={`/assets/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/extract`} method="post"><button className="primary-button">{document.extractedAt?"Re-extract text":"Extract text"}</button></form></div>
      </div><details className="editor-card"><summary>Delete document</summary><p>This removes the private PDF plus its extracted pages and search chunks. This cannot be undone.</p><form action={removeDocument.bind(null,id,documentId)}><button className="delete-button">Delete document</button></form></details></section>

      <section className="systems-section">
        <div className="section-heading"><p className="eyebrow">Document intelligence</p><h2>Maintenance candidates</h2><p>Ernest proposes; you approve, correct, or reject. Regeneration only replaces still-pending candidates.</p></div>
        <form className="compact-form" action={generateMaintenanceCandidates.bind(null,id,documentId)}>
          <label>Regeneration guidance<textarea name="guidance" defaultValue={guidance} maxLength={2000} rows={3} placeholder={'Example: Dates are written Month/Year. “Sep 18” means September 2018.'} /></label>
          <p className="asset-summary">Guidance may explain how to read the document, but it cannot add facts that are not present.</p>
          <button className="primary-button" disabled={pages.length===0}>{candidates.length?"Regenerate pending candidates":"Find maintenance events"}</button>
          <p className="asset-summary">Analysis can take a little while. {pendingCount ? `${pendingCount} candidate${pendingCount===1?" is":"s are"} awaiting review.` : ""}</p>
        </form>

        {candidates.length ? <div className="log-list">{candidates.map((c)=><article className="log-entry" key={c.id}>
          <div className="log-entry-meta"><span>PAGE {c.pageNumber}</span><span>{c.status.toUpperCase()}</span></div>
          <h3>{c.action}</h3>
          <p>{[c.dateText || c.occurredOn,c.engineHours?`${c.engineHours} engine hrs`:null].filter(Boolean).join(" · ") || "Date / hours not stated"}</p>
          {c.partsConsumables?<p><strong>Parts / consumables:</strong> {c.partsConsumables}</p>:null}
          {c.notes?<p><strong>Notes:</strong> {c.notes}</p>:null}
          <p className="asset-summary">Source: {document.title}, p. {c.pageNumber}</p>
          {c.status === "pending" ? <div className="candidate-actions">
            <form action={approveMaintenanceCandidate.bind(null,id,documentId,c.id)}><button className="primary-button">Approve</button></form>
            <details className="editor-card"><summary>Edit</summary><form className="compact-form" action={editAndApproveMaintenanceCandidate.bind(null,id,documentId,c.id)}>
              <label>Date as written<input name="dateText" defaultValue={c.dateText ?? ""} placeholder="Sep 18" /></label>
              <label>Exact calendar date, if known<input name="occurredOn" type="date" defaultValue={c.occurredOn ?? ""} /></label>
              <label>Engine hours<input name="engineHours" inputMode="decimal" defaultValue={c.engineHours ?? ""} /></label>
              <label>Action<input name="action" defaultValue={c.action} required /></label>
              <label>Parts / consumables<textarea name="partsConsumables" rows={2} defaultValue={c.partsConsumables ?? ""} /></label>
              <label>Notes<textarea name="notes" rows={2} defaultValue={c.notes ?? ""} /></label>
              <button className="primary-button">Save & approve</button>
            </form></details>
            <form action={rejectMaintenanceCandidate.bind(null,id,documentId,c.id)}><button className="delete-button">Reject</button></form>
          </div> : null}
        </article>)}</div>:<p className="empty-log">No candidates generated yet.</p>}
      </section>

      <section className="systems-section"><div className="section-heading"><p className="eyebrow">What Ernest knows</p><h2>Extracted text</h2><p>{pages.length} pages · {weakPages} weak after OCR fallback</p></div>{pages.length===0?<p className="empty-log">No extracted text is available. Run extraction above.</p>:<div className="log-list">{pageQuality.map((page)=><article className="log-entry" key={page.pageNumber}><div className="log-entry-meta"><span>PAGE {page.pageNumber}</span><span>{page.quality.label}</span></div>{page.text.trim()?<pre className="document-text-page">{page.text}</pre>:<p className="empty-log">No readable text was recovered from this page.</p>}</article>)}</div>}</section>
    </main>
  </div>;
}
