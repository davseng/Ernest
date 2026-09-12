import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AssetAppHeader } from "@/components/asset-app-header";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";
import { getProcedureCandidates, getProcedures, type ProcedureRecord } from "@/data/procedures";
import { addProcedure, approveProcedure, editProcedure, rejectProcedure, removeProcedure, scanDocumentForProcedures } from "./actions";

export const dynamic = "force-dynamic";

function ProcedureEditor({ assetId, procedure }: { assetId: string; procedure: ProcedureRecord }) {
  return <details className="editor-card touch-editor">
    <summary>Edit procedure</summary>
    <form action={editProcedure.bind(null, assetId, procedure.id)} className="stack">
      <label>Title<input name="title" defaultValue={procedure.title} required /></label>
      <label>Type<select name="procedureType" defaultValue={procedure.procedureType}><option value="emergency">Emergency</option><option value="checklist">Checklist</option><option value="routine">Routine</option></select></label>
      <label>Notes<textarea name="notes" defaultValue={procedure.notes ?? ""} rows={2} /></label>
      <label>Steps — one per line<textarea name="steps" defaultValue={procedure.steps.map((step) => step.instruction).join("\n")} rows={Math.min(Math.max(procedure.steps.length + 1, 4), 16)} required /></label>
      <button type="submit">Save procedure changes</button>
    </form>
    <div className="destructive-zone">
      <p className="muted">Delete only if this is a mistake or duplicate. Source documents are not deleted.</p>
      <form action={removeProcedure.bind(null, assetId, procedure.id)} className="stack">
        <label>Confirm deletion<select name="confirm" defaultValue="" required><option value="" disabled>Choose…</option><option value="yes">Delete {procedure.title}</option></select></label>
        <button className="delete-button" type="submit">Delete procedure</button>
      </form>
    </div>
  </details>;
}

export default async function ProceduresPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const { id } = await params;
  const { status } = await searchParams;
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
      <AssetAppHeader assetId={asset.id} assetName={asset.name} email={session.user.email} />
      <main className="page-main">
        <section className="page-heading">
          <p className="eyebrow">Procedures & checklists</p>
          <h1>Operate {asset.name}</h1>
          <p>Run trusted checklists and emergency procedures, or manage the source-backed masters.</p>
          {pending.length > 0 && <p><strong>{pending.length} procedure {pending.length === 1 ? "candidate needs" : "candidates need"} review.</strong></p>}
        </section>

        {status ? <p className="operation-status" role="status">✓ {status}</p> : null}

        {emergencies.length > 0 && <section id="emergency" className="card" style={{ border: "3px solid currentColor" }} aria-labelledby="emergency-heading">
          <p className="eyebrow">Emergency · immediate use</p><h2 id="emergency-heading">Emergency procedures</h2>
          <p><strong>Open the applicable procedure and follow the source-backed sequence shown.</strong></p>
          <div className="stack">{emergencies.map((procedure) => <details key={procedure.id}><summary><strong>{procedure.title}</strong></summary>{procedure.notes && <p>{procedure.notes}</p>}<p><Link className="primary-button" href={`/assets/${asset.id}/procedures/${procedure.id}/run`}>Run emergency procedure →</Link></p><ol style={{ fontSize: "1.05rem", lineHeight: 1.6 }}>{procedure.steps.map((step) => <li key={step.id ?? step.position}>{step.instruction}{step.note ? ` — ${step.note}` : ""}</li>)}</ol>{procedure.sourceDocumentTitle && <p className="muted"><strong>Source:</strong> {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}<ProcedureEditor assetId={asset.id} procedure={procedure} /></details>)}</div>
        </section>}

        <section id="checklists" className="card">
          <p className="eyebrow">Run aboard</p><h2>Checklists</h2><p className="muted">Run checklist opens a full-screen phone/tablet mode. A run never changes the master checklist.</p>
          {checklists.length === 0 ? <p className="muted">No verified checklists yet.</p> : checklists.map((procedure) => <details key={procedure.id}><summary><strong>{procedure.title}</strong> <span className="muted">· {procedure.steps.length} steps</span></summary>{procedure.notes && <p>{procedure.notes}</p>}<p><Link className="primary-button" href={`/assets/${asset.id}/procedures/${procedure.id}/run`}>Run checklist →</Link></p><ol>{procedure.steps.map((step) => <li key={step.id ?? step.position}>{step.instruction}{step.note ? ` — ${step.note}` : ""}</li>)}</ol>{procedure.sourceDocumentTitle && <p className="muted"><strong>Source:</strong> {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}<ProcedureEditor assetId={asset.id} procedure={procedure} /></details>)}
        </section>

        <section className="card"><h2>Routine procedures</h2>{routines.length === 0 ? <p className="muted">No verified routine procedures yet.</p> : routines.map((procedure) => <details key={procedure.id}><summary><strong>{procedure.title}</strong> <span className="muted">· {procedure.steps.length} steps</span></summary>{procedure.notes && <p>{procedure.notes}</p>}<p><Link className="primary-button" href={`/assets/${asset.id}/procedures/${procedure.id}/run`}>Run routine procedure →</Link></p><ol>{procedure.steps.map((step) => <li key={step.id ?? step.position}>{step.instruction}{step.note ? ` — ${step.note}` : ""}</li>)}</ol>{procedure.sourceDocumentTitle && <p className="muted"><strong>Source:</strong> {procedure.sourceDocumentTitle}{procedure.sourcePage ? ` · page ${procedure.sourcePage}` : ""}</p>}<ProcedureEditor assetId={asset.id} procedure={procedure} /></details>)}</section>

        <section className="card"><p className="eyebrow">Owner-created</p><h2>Add a procedure</h2><p>Create a checklist, routine, or emergency procedure directly. Ernest does not invent the steps.</p><details className="editor-card touch-editor"><summary>Create procedure</summary><form action={addProcedure.bind(null, asset.id)} className="stack"><label>Title<input name="title" required /></label><label>Type<select name="procedureType" defaultValue="checklist"><option value="checklist">Checklist</option><option value="routine">Routine</option><option value="emergency">Emergency</option></select></label><label>Notes<textarea name="notes" rows={2} /></label><label>Steps — one per line<textarea name="steps" rows={8} required /></label><button type="submit">Save new procedure</button></form></details></section>

        <section className="card"><h2>Find procedures in documents</h2><p>Scan an already-extracted document to create review candidates.</p><div className="stack">{documents.filter((document) => document.extractedAt).map((document) => <form key={document.id} action={scanDocumentForProcedures.bind(null, asset.id, document.id)}><button type="submit">Find procedures in {document.title}</button></form>)}</div></section>

        <section className="card" aria-labelledby="review-heading"><p className="eyebrow">Human verification</p><h2 id="review-heading">Review candidates{pending.length > 0 ? ` (${pending.length})` : ""}</h2><p>Nothing becomes trusted procedure knowledge until you approve it.</p>{pending.length === 0 ? <p className="muted">No procedure candidates waiting for review.</p> : <div className="stack">{pending.map((candidate) => <article key={candidate.id} className="card" style={{ borderWidth: 2 }}><p className="eyebrow">Needs review · {candidate.procedureType}</p><h3>{candidate.title}</h3><p className="muted">Source: {candidate.documentTitle} · page {candidate.pageNumber} · {candidate.steps.length} proposed steps</p><form action={approveProcedure.bind(null, asset.id, candidate.id)} className="stack"><label>Title<input name="title" defaultValue={candidate.title} required /></label><label>Type<select name="procedureType" defaultValue={candidate.procedureType}><option value="emergency">Emergency</option><option value="checklist">Checklist</option><option value="routine">Routine</option></select></label><label>Notes<textarea name="notes" defaultValue={candidate.notes ?? ""} rows={2} /></label><label>Steps — one per line<textarea name="steps" defaultValue={candidate.steps.map((step) => step.instruction).join("\n")} rows={Math.min(Math.max(candidate.steps.length + 1, 4), 14)} required /></label><button type="submit">Approve as trusted procedure</button></form><form action={rejectProcedure.bind(null, asset.id, candidate.id)}><button className="secondary-action" type="submit">Reject candidate</button></form></article>)}</div>}</section>
      </main>
    </div>
  );
}
