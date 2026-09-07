import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";
import { getProcedureCandidates, getProcedures } from "@/data/procedures";
import { approveProcedure, rejectProcedure, scanDocumentForProcedures } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProceduresPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const { id } = await params;
  const [asset, documents, procedures, candidates] = await Promise.all([
    getAsset(id, session.user.id),
    getDocumentsForAsset(id, session.user.id),
    getProcedures(id, session.user.id),
    getProcedureCandidates(id, session.user.id),
  ]);
  if (!asset) redirect("/");

  const pending = candidates.filter((candidate) => candidate.status === "pending");
  const emergencies = procedures.filter((procedure) => procedure.procedureType === "emergency");
  const checklists = procedures.filter((procedure) => procedure.procedureType === "checklist");
  const routines = procedures.filter((procedure) => procedure.procedureType === "routine");

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href={`/?asset=${asset.id}`}><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
        <nav className="conversation-nav" aria-label="Asset tools">
          <Link href={`/assets/${asset.id}/inventory`}>Inventory</Link>
          <Link href={`/assets/${asset.id}/knowledge`}>Equipment</Link>
          <Link href={`/assets/${asset.id}/documents`}>Documents</Link>
          <Link href={`/assets/${asset.id}`}>Asset</Link>
          <AccountMenu email={session.user.email} />
        </nav>
      </header>

      <main className="page-main">
        <section className="page-heading">
          <p className="eyebrow">{asset.name}</p>
          <h1>Procedures</h1>
          <p>Trusted checklists, operating procedures, and emergency actions. Source-backed procedures remain tied to the document page they came from.</p>
          {pending.length > 0 && <p><strong>{pending.length} procedure {pending.length === 1 ? "candidate needs" : "candidates need"} review.</strong></p>}
        </section>

        {emergencies.length > 0 && (
          <section className="card" style={{ border: "3px solid currentColor" }} aria-labelledby="emergency-heading">
            <p className="eyebrow">Emergency · immediate use</p>
            <h2 id="emergency-heading">Emergency procedures</h2>
            <p><strong>Open the applicable procedure and follow the source-backed sequence shown.</strong> All steps remain visible; Ernest does not require one step to be checked before showing the next.</p>
            <div className="stack">
              {emergencies.map((procedure) => (
                <details key={procedure.id} open>
                  <summary><strong>{procedure.title}</strong></summary>
                  {procedure.notes && <p>{procedure.notes}</p>}
                  <ol style={{ fontSize: "1.05rem", lineHeight: 1.6 }}>
                    {procedure.steps.map((step) => <li key={step.id ?? step.position}>{step.instruction}{step.note ? ` — ${step.note}` : ""}</li>)}
                  </ol>
                  {procedure.sourceDocumentTitle && <p className="muted"><strong>Source:</strong> {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}
                </details>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <p className="eyebrow">Run aboard</p>
          <h2>Checklists</h2>
          {checklists.length === 0 ? <p className="muted">No verified checklists yet.</p> : checklists.map((procedure) => (
            <details key={procedure.id}>
              <summary><strong>{procedure.title}</strong> <span className="muted">· {procedure.steps.length} steps</span></summary>
              {procedure.notes && <p>{procedure.notes}</p>}
              <form>
                <div className="stack" style={{ marginTop: ".75rem" }}>
                  {procedure.steps.map((step) => (
                    <label key={step.id ?? step.position} style={{ display: "flex", gap: ".8rem", alignItems: "flex-start", padding: ".35rem 0", fontSize: "1.02rem", lineHeight: 1.45 }}>
                      <input type="checkbox" style={{ width: "1.25rem", height: "1.25rem", marginTop: ".1rem", flex: "0 0 auto" }} />
                      <span>{step.instruction}{step.note ? ` — ${step.note}` : ""}</span>
                    </label>
                  ))}
                </div>
                <button type="reset" style={{ marginTop: ".8rem" }}>Clear checks</button>
              </form>
              {procedure.sourceDocumentTitle && <p className="muted"><strong>Source:</strong> {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}
            </details>
          ))}
        </section>

        <section className="card">
          <h2>Routine procedures</h2>
          {routines.length === 0 ? <p className="muted">No verified routine procedures yet.</p> : routines.map((procedure) => (
            <details key={procedure.id}>
              <summary><strong>{procedure.title}</strong> <span className="muted">· {procedure.steps.length} steps</span></summary>
              {procedure.notes && <p>{procedure.notes}</p>}
              <ol>{procedure.steps.map((step) => <li key={step.id ?? step.position}>{step.instruction}{step.note ? ` — ${step.note}` : ""}</li>)}</ol>
              {procedure.sourceDocumentTitle && <p className="muted"><strong>Source:</strong> {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}
            </details>
          ))}
        </section>

        <section className="card">
          <h2>Find procedures in documents</h2>
          <p>Scan an already-extracted document. Ernest uses the original PDF layout when available and only proposes actions supported by the source.</p>
          <div className="stack">
            {documents.filter((document) => document.extractedAt).map((document) => (
              <form key={document.id} action={scanDocumentForProcedures.bind(null, asset.id, document.id)}>
                <button type="submit">Find procedures in {document.title}</button>
              </form>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="review-heading">
          <p className="eyebrow">Human verification</p>
          <h2 id="review-heading">Review candidates{pending.length > 0 ? ` (${pending.length})` : ""}</h2>
          <p>Nothing becomes trusted procedure knowledge until you review and approve it. Edit any title, type, notes, or steps before approval.</p>
          {pending.length === 0 ? <p className="muted">No procedure candidates waiting for review.</p> : (
            <div className="stack">
              {pending.map((candidate) => (
                <article key={candidate.id} className="card" style={{ borderWidth: 2 }}>
                  <p className="eyebrow">Needs review · {candidate.procedureType}</p>
                  <h3>{candidate.title}</h3>
                  <p className="muted">Source: {candidate.documentTitle} · page {candidate.pageNumber} · {candidate.steps.length} proposed steps</p>
                  <form action={approveProcedure.bind(null, asset.id, candidate.id)} className="stack">
                    <label>Title<input name="title" defaultValue={candidate.title} required /></label>
                    <label>Type
                      <select name="procedureType" defaultValue={candidate.procedureType}>
                        <option value="emergency">Emergency</option>
                        <option value="checklist">Checklist</option>
                        <option value="routine">Routine</option>
                      </select>
                    </label>
                    <label>Notes<textarea name="notes" defaultValue={candidate.notes ?? ""} rows={2} /></label>
                    <label>Steps — one per line<textarea name="steps" defaultValue={candidate.steps.map((step) => step.instruction).join("\n")} rows={Math.min(Math.max(candidate.steps.length + 1, 4), 14)} required /></label>
                    <button type="submit">Approve as trusted procedure</button>
                  </form>
                  <form action={rejectProcedure.bind(null, asset.id, candidate.id)}>
                    <button type="submit">Reject candidate</button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
