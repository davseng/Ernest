import "server-only";

import postgres from "postgres";

import type { ErnestWriteProposal } from "@/data/ernest-write-proposals";

let dbClient: ReturnType<typeof postgres> | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  dbClient ??= postgres(url, { max: 5 });
  return dbClient;
}

export type PersistedSource = {
  documentId?: string;
  documentTitle: string;
  pageNumber: number;
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: PersistedSource[];
  proposal?: ErnestWriteProposal;
  writeResult?: { ok: boolean; message: string };
  createdAt: Date;
};

type ConversationRow = {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  text_content: string;
  sources: PersistedSource[] | null;
  proposal: ErnestWriteProposal | null;
  write_result: { ok: boolean; message: string } | null;
  created_at: Date;
};

function titleFromQuestion(question: string) {
  const compact = question.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  return compact.length <= 60 ? compact : `${compact.slice(0, 57).trimEnd()}…`;
}

export async function listConversations(assetId: string, ownerId: string, limit = 12) {
  const rows = await database()<ConversationRow[]>`
    SELECT c.id, c.title, c.created_at, c.updated_at
    FROM conversations c
    INNER JOIN assets a ON a.id = c.asset_id
    WHERE c.asset_id = ${assetId}
      AND c.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    ORDER BY c.updated_at DESC
    LIMIT ${Math.max(1, Math.min(limit, 50))}`;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createConversation(assetId: string, ownerId: string, firstQuestion: string) {
  const rows = await database()<ConversationRow[]>`
    INSERT INTO conversations (asset_id, owner_id, title)
    SELECT a.id, a.owner_id, ${titleFromQuestion(firstQuestion)}
    FROM assets a
    WHERE a.id = ${assetId} AND a.owner_id = ${ownerId}
    RETURNING id, title, created_at, updated_at`;
  if (!rows[0]) return undefined;
  return {
    id: rows[0].id,
    title: rows[0].title,
    createdAt: rows[0].created_at,
    updatedAt: rows[0].updated_at,
  };
}

export async function getConversationMessages(conversationId: string, assetId: string, ownerId: string) {
  const rows = await database()<MessageRow[]>`
    SELECT m.id, m.role, m.text_content, m.sources, m.proposal, m.write_result, m.created_at
    FROM conversation_messages m
    INNER JOIN conversations c ON c.id = m.conversation_id
    INNER JOIN assets a ON a.id = c.asset_id
    WHERE m.conversation_id = ${conversationId}
      AND m.asset_id = ${assetId}
      AND m.owner_id = ${ownerId}
      AND c.asset_id = ${assetId}
      AND c.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    ORDER BY m.created_at ASC`;
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text_content,
    sources: row.sources ?? undefined,
    proposal: row.proposal ?? undefined,
    writeResult: row.write_result ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function conversationBelongsToOwner(conversationId: string, assetId: string, ownerId: string) {
  const rows = await database()`
    SELECT c.id
    FROM conversations c
    INNER JOIN assets a ON a.id = c.asset_id
    WHERE c.id = ${conversationId}
      AND c.asset_id = ${assetId}
      AND c.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    LIMIT 1`;
  return rows.length === 1;
}

export async function appendConversationMessage(
  conversationId: string,
  assetId: string,
  ownerId: string,
  message: {
    role: "user" | "assistant";
    text: string;
    sources?: PersistedSource[];
    proposal?: ErnestWriteProposal;
    writeResult?: { ok: boolean; message: string };
  },
) {
  const sql = database();
  const owned = await conversationBelongsToOwner(conversationId, assetId, ownerId);
  if (!owned) return undefined;

  const rows = await sql<{ id: string }[]>`
    INSERT INTO conversation_messages (
      conversation_id, asset_id, owner_id, role, text_content, sources, proposal, write_result
    ) VALUES (
      ${conversationId}, ${assetId}, ${ownerId}, ${message.role}, ${message.text},
      ${message.sources ? sql.json(message.sources) : null},
      ${message.proposal ? sql.json(message.proposal) : null},
      ${message.writeResult ? sql.json(message.writeResult) : null}
    )
    RETURNING id`;

  await sql`
    UPDATE conversations
    SET updated_at = now()
    WHERE id = ${conversationId} AND asset_id = ${assetId} AND owner_id = ${ownerId}`;

  return rows[0]?.id;
}

export async function updateConversationMessageState(
  messageId: string,
  conversationId: string,
  assetId: string,
  ownerId: string,
  state: { proposal?: ErnestWriteProposal; writeResult?: { ok: boolean; message: string } },
) {
  const sql = database();
  const rows = await sql`
    UPDATE conversation_messages m
    SET proposal = ${state.proposal ? sql.json(state.proposal) : null},
        write_result = ${state.writeResult ? sql.json(state.writeResult) : null}
    FROM conversations c, assets a
    WHERE m.id = ${messageId}
      AND m.conversation_id = ${conversationId}
      AND m.asset_id = ${assetId}
      AND m.owner_id = ${ownerId}
      AND c.id = m.conversation_id
      AND c.asset_id = ${assetId}
      AND c.owner_id = ${ownerId}
      AND a.id = c.asset_id
      AND a.owner_id = ${ownerId}
    RETURNING m.id`;
  return rows.length === 1;
}
