import "server-only";

import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

function database() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  client ??= postgres(databaseUrl, { max: 5 });
  return client;
}

export type ErnestContextPage = {
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  text: string;
  relevance: number;
};

type ContextRow = {
  document_id: string;
  document_title: string;
  page_number: number;
  text_content: string;
  relevance: number | string;
};

const GENERIC_QUERY_WORDS = new Set([
  "about", "and", "are", "can", "could", "document", "does", "for", "from",
  "have", "how", "into", "me", "should", "that", "the", "their", "there",
  "these", "this", "those", "what", "when", "where", "which", "with", "would",
]);

function buildRetrievalQuery(question: string) {
  const terms = question
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]*/g)
    ?.filter((term) => term.length > 2 && !GENERIC_QUERY_WORDS.has(term)) ?? [];

  const uniqueTerms = [...new Set(terms)].slice(0, 12);
  if (uniqueTerms.length === 0) return question.trim().slice(0, 500);
  // PostgreSQL websearch_to_tsquery uses the literal word OR as the boolean OR operator.
  return uniqueTerms.join(" OR ");
}

export async function getErnestDocumentContext(assetId: string, ownerId: string, question: string) {
  const normalized = question.trim().slice(0, 500);
  if (!normalized) return [];
  const retrievalQuery = buildRetrievalQuery(normalized);

  const rows = await database()<ContextRow[]>`
    WITH query AS (
      SELECT websearch_to_tsquery('english', ${retrievalQuery}) AS value
    ), ranked_hits AS (
      SELECT
        c.document_id,
        c.page_number,
        ts_rank(to_tsvector('english', c.text_content), q.value) AS relevance
      FROM document_chunks c
      INNER JOIN documents d ON d.id = c.document_id
      INNER JOIN assets a ON a.id = d.asset_id
      CROSS JOIN query q
      WHERE d.asset_id = ${assetId}
        AND d.owner_id = ${ownerId}
        AND a.owner_id = ${ownerId}
        AND to_tsvector('english', c.text_content) @@ q.value
      ORDER BY relevance DESC
      LIMIT 8
    ), expanded_pages AS (
      SELECT
        p.document_id,
        p.page_number,
        p.text_content,
        MAX(h.relevance) AS relevance
      FROM ranked_hits h
      INNER JOIN document_pages p
        ON p.document_id = h.document_id
       AND p.page_number BETWEEN GREATEST(1, h.page_number - 1) AND h.page_number + 1
      GROUP BY p.document_id, p.page_number, p.text_content
    )
    SELECT
      e.document_id,
      d.title AS document_title,
      e.page_number,
      e.text_content,
      e.relevance
    FROM expanded_pages e
    INNER JOIN documents d ON d.id = e.document_id
    INNER JOIN assets a ON a.id = d.asset_id
    WHERE d.asset_id = ${assetId}
      AND d.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    ORDER BY e.relevance DESC, d.title, e.page_number
    LIMIT 20`;

  let totalChars = 0;
  const context: ErnestContextPage[] = [];
  for (const row of rows) {
    if (!row.text_content.trim()) continue;
    if (totalChars + row.text_content.length > 32000 && context.length > 0) break;
    context.push({
      documentId: row.document_id,
      documentTitle: row.document_title,
      pageNumber: row.page_number,
      text: row.text_content,
      relevance: Number(row.relevance),
    });
    totalChars += row.text_content.length;
  }

  return context;
}
