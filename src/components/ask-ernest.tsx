"use client";

import {EvidenceList} from "@/components/evidence-list";
import {ErnestWriteCard} from "@/components/ernest-write-card";
import { useActionState } from "react";

import { askErnest, type AskErnestState } from "@/app/assets/[id]/ask-actions";

const emptyAskErnestState: AskErnestState = {
  question: "",
  answer: "",
  sources: [],
};

export function AskErnest({ assetId }: { assetId: string }) {
  const [state, formAction, pending] = useActionState(
    askErnest.bind(null, assetId),
    emptyAskErnestState,
  );

  return (
    <section className="document-search-section" id="ask-ernest">
      <div className="section-heading">
        <p className="eyebrow">Assistant</p>
        <h2>Ask Ernest</h2>
        <p>Ernest answers from your extracted documents and cites the pages used.</p>
      </div>
      <form className="document-search-form" action={formAction}>
        <label htmlFor="ernestQuestion">Ask about this asset</label>
        <div className="document-search-controls">
          <input
            id="ernestQuestion"
            name="question"
            defaultValue={state.question}
            maxLength={500}
            placeholder="How do I winterize the freshwater system?"
            required
          />
          <button type="submit" disabled={pending}>{pending ? "Thinking…" : "Ask"}</button>
        </div>
      </form>
      {state.proposal ? <ErnestWriteCard key={JSON.stringify(state.proposal)} assetId={assetId} proposal={state.proposal}/> : null}
      {state.error ? <p className="error-notice">{state.error}</p> : null}
      {state.answer ? (
        <div className="document-search-results" aria-live="polite">
          <article className="document-search-result">
            <div className="document-search-source"><strong>Ernest</strong></div>
            <p style={{ whiteSpace: "pre-wrap" }}>{state.answer}</p>
          </article>
          <EvidenceList assetId={assetId} sources={state.sources}/>
        </div>
      ) : null}
    </section>
  );
}
