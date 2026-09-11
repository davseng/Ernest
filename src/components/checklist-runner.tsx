"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type RunnerStep = { id?: string; position: number; instruction: string; note: string | null };

export function ChecklistRunner({
  assetId,
  assetName,
  title,
  notes,
  steps,
  sourceDocumentTitle,
  sourcePage,
}: {
  assetId: string;
  assetName: string;
  title: string;
  notes: string | null;
  steps: RunnerStep[];
  sourceDocumentTitle: string | null;
  sourcePage: number | null;
}) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const completed = checked.size;
  const percent = useMemo(() => steps.length ? Math.round((completed / steps.length) * 100) : 0, [completed, steps.length]);

  function toggle(position: number) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(position)) next.delete(position); else next.add(position);
      return next;
    });
  }

  function restart() {
    if (checked.size === 0 || window.confirm("Restart this checklist run? The master checklist will not change.")) setChecked(new Set());
  }

  return <main className="checklist-runner">
    <header className="checklist-runner-header">
      <div><p className="eyebrow">{assetName} · checklist run</p><h1>{title}</h1></div>
      <Link href={`/assets/${assetId}/procedures#checklists`}>Exit</Link>
    </header>

    {notes ? <p className="checklist-runner-notes">{notes}</p> : null}

    <div className="checklist-progress" aria-label={`${completed} of ${steps.length} complete`}>
      <div><strong>{completed} / {steps.length}</strong><span>{percent}% complete</span></div>
      <progress max={steps.length || 1} value={completed} />
    </div>

    <div className="checklist-runner-steps">
      {steps.map((step, index) => {
        const done = checked.has(step.position);
        return <button key={step.id ?? step.position} type="button" className={done ? "checklist-runner-step done" : "checklist-runner-step"} onClick={() => toggle(step.position)}>
          <span className="checklist-step-number">{done ? "✓" : index + 1}</span>
          <span className="checklist-step-copy"><strong>{step.instruction}</strong>{step.note ? <small>{step.note}</small> : null}</span>
        </button>;
      })}
    </div>

    {completed === steps.length && steps.length > 0 ? <div className="checklist-complete">✓ Checklist complete</div> : null}

    <footer className="checklist-runner-footer">
      <button type="button" onClick={restart}>Restart checklist</button>
      {sourceDocumentTitle ? <p>Source: {sourceDocumentTitle}{sourcePage ? ` · page ${sourcePage}` : ""}</p> : <p>Owner-created checklist</p>}
    </footer>
  </main>;
}
