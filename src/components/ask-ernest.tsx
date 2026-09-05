"use client";

import { useActionState } from "react";

import { askErnest, emptyAskErnestState } from "@/app/assets/[id]/ask-actions";

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
      {state.error ? <p className="error-notice">{state.error}</p> : null}
      {state.answer ? (
        <div className="document-search-results" aria-live="polite">
          <article className="document-search-result">
            <div className="document-search-source"><strong>Ernest</strong></div>
            <p style={{ whiteSpace: "pre-wrap" }}>{state.answer}</p>
          </article>
          {state.sources.length > 0 ? (
            <p className="document-search-count">
              Context used: {state.sources.map((source) => `${source.documentTitle}, p. ${source.pageNumber}`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
