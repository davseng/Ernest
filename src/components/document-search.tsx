type DocumentSearchResult = {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  chunkIndex: number;
  text: string;
};

export function DocumentSearch({
  assetId,
  query,
  results,
}: {
  assetId: string;
  query: string;
  results: DocumentSearchResult[];
}) {
  return (
    <section className="document-search-section" id="document-search">
      <div className="section-heading">
        <p className="eyebrow">Knowledge</p>
        <h2>Search documents</h2>
        <p>Search extracted PDF text. Matches are ranked by chunk, but results show the full matching page for context.</p>
      </div>
      <form className="document-search-form" method="get" action={`/assets/${assetId}`}>
        <label htmlFor="documentQuery">Search your manuals and records</label>
        <div className="document-search-controls">
          <input
            id="documentQuery"
            name="documentQuery"
            defaultValue={query}
            maxLength={200}
            placeholder="Try a model number, procedure, or phrase"
          />
          <button type="submit">Search</button>
        </div>
      </form>
      {query ? (
        <div className="document-search-results" aria-live="polite">
          <p className="document-search-count">
            {results.length === 0
              ? `No extracted text matched “${query}”.`
              : `${results.length} ${results.length === 1 ? "result" : "results"} for “${query}”`}
          </p>
          {results.map((result) => (
            <article className="document-search-result" key={`${result.documentId}-${result.pageNumber}-${result.chunkIndex}`}>
              <div className="document-search-source">
                <strong>{result.documentTitle}</strong>
                <span>Page {result.pageNumber}</span>
              </div>
              <p>{result.text}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
