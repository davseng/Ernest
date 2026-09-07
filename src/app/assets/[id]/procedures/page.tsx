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
        </section>

        {emergencies.length > 0 && (
          <section className="card" style={{ borderWidth: 2 }}>
            <p className="eyebrow">Emergency</p>
            <h2>Immediate actions</h2>
            <p>Open the applicable procedure and follow the source-backed sequence. Do not delay access by requiring completion of prior steps.</p>
            <div className="stack">
              {emergencies.map((procedure) => (
                <details key={procedure.id} open>
                  <summary><strong>{procedure.title}</strong></summary>
                  {procedure.notes && <p>{procedure.notes}</p>}
                  <ol>
                    {procedure.steps.map((step) => <li key={step.id ?? step.position}>{step.instruction}{step.note ? ` — ${step.note}` : ""}</li>)}
                  </ol>
                  {procedure.sourceDocumentTitle && <p className="muted">Source: {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}
                </details>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <h2>Checklists</h2>
          {checklists.length === 0 ? <p className="muted">No verified checklists yet.</p> : checklists.map((procedure) => (
            <details key={procedure.id}>
              <summary><strong>{procedure.title}</strong></summary>
              {procedure.notes && <p>{procedure.notes}</p>}
              <div className="stack">
                {procedure.steps.map((step) => (
                  <label key={step.id ?? step.position} style={{ display: "flex", gap: ".65rem", alignItems: "flex-start" }}>
                    <input type="checkbox" />
                    <span>{step.instruction}{step.note ? ` — ${step.note}` : ""}</span>
                  </label>
                ))}
              </div>
              {procedure.sourceDocumentTitle && <p className="muted">Source: {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}
            </details>
          ))}
        </section>

        <section className="card">
          <h2>Routine procedures</h2>
          {routines.length === 0 ? <p className="muted">No verified routine procedures yet.</p> : routines.map((procedure) => (
            <details key={procedure.id}>
              <summary><strong>{procedure.title}</strong></summary>
              {procedure.notes && <p>{procedure.notes}</p>}
              <ol>{procedure.steps.map((step) => <li key={step.id ?? step.position}>{step.instruction}{step.note ? ` — ${step.note}` : ""}</li>)}</ol>
              {procedure.sourceDocumentTitle && <p className="muted">Source: {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}
            </details>
          ))}
        </section>

        <section className="card">
          <h2>Find procedures in documents</h2>
          <p>Scan an already-extracted document. Ernest only proposes ordered actions that the document itself supports.</p>
          <div className="stack">
            {documents.filter((document) => document.extractedAt).map((document) => (
              <form key={document.id} action={scanDocumentForProcedures.bind(null, asset.id, document.id)}>
                <button type="submit">Scan {document.title}</button>
              </form>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Review candidates</h2>
          {pending.length === 0 ? <p className="muted">No procedure candidates waiting for review.</p> : (
            <div className="stack">
              {pending.map((candidate) => (
                <article key={candidate.id} className="card">
                  <p className="eyebrow">{candidate.procedureType} · {candidate.documentTitle} · page {candidate.pageNumber}</p>
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
                    <button type="submit">Approve procedure</button>
                  </form>
                  <form action={rejectProcedure.bind(null, asset.id, candidate.id)}>
                    <button type="submit">Reject</button>
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
