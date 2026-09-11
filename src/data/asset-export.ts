import "server-only";

import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;
function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  client ??= postgres(url, { max: 5 });
  return client;
}

/**
 * Portable, versioned snapshot of Ernest's structured knowledge.
 * Originals remain private in R2 and are represented by metadata here; the
 * export deliberately does not mint long-lived storage URLs.
 */
export async function buildAssetExport(assetId: string, ownerId: string) {
  const db = database();
  const [asset] = await db<Array<Record<string, unknown>>>`
    SELECT id,name,type,make,model,year,summary,registration_number
    FROM assets WHERE id=${assetId} AND owner_id=${ownerId} LIMIT 1`;
  if (!asset) return undefined;

  const systems = await db<Array<Record<string, unknown>>>`
    SELECT id,name,description,position FROM systems WHERE asset_id=${assetId} ORDER BY position,name`;
  const components = await db<Array<Record<string, unknown>>>`
    SELECT c.id,c.system_id,c.name,c.manufacturer,c.model,c.serial_number,c.location,c.notes,c.position,
      c.lifecycle_status,c.lifecycle_changed_on::text,c.lifecycle_notes
    FROM components c JOIN systems s ON s.id=c.system_id JOIN assets a ON a.id=s.asset_id
    WHERE a.id=${assetId} AND a.owner_id=${ownerId} ORDER BY s.position,c.position,c.name`;
  const documents = await db<Array<Record<string, unknown>>>`
    SELECT id,title,original_filename,content_type,size_bytes,source_type,source_url,created_at,extracted_at,page_count
    FROM documents WHERE asset_id=${assetId} AND owner_id=${ownerId} ORDER BY created_at`;
  const documentLinks = await db<Array<Record<string, unknown>>>`
    SELECT component_id,document_id,relationship FROM component_documents
    WHERE asset_id=${assetId} AND owner_id=${ownerId} ORDER BY component_id,document_id`;
  const photos = await db<Array<Record<string, unknown>>>`
    SELECT id,component_id,title,original_filename,content_type,size_bytes,notes,taken_at,created_at
    FROM photos WHERE asset_id=${assetId} AND owner_id=${ownerId} ORDER BY created_at`;
  const inventory = await db<Array<Record<string, unknown>>>`
    SELECT i.id,i.name,i.quantity::text,i.details,i.source_label,i.source_page,
      COALESCE(array_agg(l.code ORDER BY l.code) FILTER (WHERE l.code IS NOT NULL),ARRAY[]::text[]) locations
    FROM inventory_items i LEFT JOIN inventory_item_locations il ON il.item_id=i.id
    LEFT JOIN inventory_locations l ON l.id=il.location_id
    WHERE i.asset_id=${assetId} AND i.owner_id=${ownerId} GROUP BY i.id ORDER BY lower(i.name),i.name`;
  const locations = await db<Array<Record<string, unknown>>>`
    SELECT id,code,label,notes FROM inventory_locations WHERE asset_id=${assetId} AND owner_id=${ownerId} ORDER BY code`;
  const procedures = await db<Array<Record<string, unknown>>>`
    SELECT p.id,p.title,p.procedure_type,p.notes,p.source_document_id,p.source_page,
      COALESCE(json_agg(json_build_object('position',s.position,'instruction',s.instruction,'note',s.note) ORDER BY s.position)
        FILTER (WHERE s.id IS NOT NULL),'[]'::json) steps
    FROM procedures p LEFT JOIN procedure_steps s ON s.procedure_id=p.id
    WHERE p.asset_id=${assetId} AND p.owner_id=${ownerId} GROUP BY p.id ORDER BY p.title`;
  const logEntries = await db<Array<Record<string, unknown>>>`
    SELECT id,occurred_at,created_at,entry_type,title,body,source,latitude,longitude
    FROM log_entries WHERE asset_id=${assetId} ORDER BY occurred_at,created_at`;
  const conversations = await db<Array<Record<string, unknown>>>`
    SELECT id,title,created_at,updated_at FROM conversations
    WHERE asset_id=${assetId} AND owner_id=${ownerId} ORDER BY created_at`;
  const messages = await db<Array<Record<string, unknown>>>`
    SELECT id,conversation_id,role,text_content,sources,proposal,write_result,created_at
    FROM conversation_messages WHERE asset_id=${assetId} AND owner_id=${ownerId} ORDER BY created_at`;
  const maintenanceCandidates = await db<Array<Record<string, unknown>>>`
    SELECT id,document_id,page_number,date_text,occurred_on::text,engine_hours::text,action,parts_consumables,notes,status,reviewed_at
    FROM document_maintenance_candidates WHERE asset_id=${assetId} AND owner_id=${ownerId} ORDER BY created_at`;

  return {
    exportFormat: "ernest-asset-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    trustNote: "This snapshot preserves Ernest records and provenance. Conversation history and unapproved candidates are context, not verified asset facts.",
    originalsNote: "Private document/photo originals are not embedded in this JSON. Their filenames and metadata are included so a future full archive can pair originals with this manifest without exposing storage credentials.",
    asset,
    systems,
    components,
    evidence: { documents, componentDocumentLinks: documentLinks, photos },
    inventory: { locations, items: inventory },
    procedures,
    operatingLog: logEntries,
    maintenanceCandidates,
    conversations: { threads: conversations, messages },
  };
}
