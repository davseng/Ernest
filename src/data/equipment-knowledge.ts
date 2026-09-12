import "server-only";

import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  client ??= postgres(url, { max: 5 });
  return client;
}

export type ComponentDocumentLink = {
  componentId: string;
  documentId: string;
  relationship: "manual" | "service" | "reference" | "other";
  documentTitle: string;
};

export type EquipmentLifecycleStatus = "installed" | "removed_replaced" | "unknown";

export type ComponentLifecycle = {
  componentId: string;
  status: EquipmentLifecycleStatus;
  changedOn: string | null;
  notes: string | null;
};

export async function getComponentDocumentLinks(assetId: string, ownerId: string) {
  const rows = await database()<Array<{
    component_id: string;
    document_id: string;
    relationship: ComponentDocumentLink["relationship"];
    document_title: string;
  }>>`
    SELECT cd.component_id, cd.document_id, cd.relationship, d.title AS document_title
    FROM component_documents cd
    INNER JOIN documents d ON d.id = cd.document_id
    INNER JOIN assets a ON a.id = cd.asset_id
    WHERE cd.asset_id = ${assetId}
      AND cd.owner_id = ${ownerId}
      AND d.owner_id = ${ownerId}
      AND a.owner_id = ${ownerId}
    ORDER BY lower(d.title), d.title;
  `;

  return rows.map((row) => ({
    componentId: row.component_id,
    documentId: row.document_id,
    relationship: row.relationship,
    documentTitle: row.document_title,
  }));
}

export async function getComponentLifecycles(assetId: string, ownerId: string) {
  const rows = await database()<Array<{
    component_id: string;
    lifecycle_status: EquipmentLifecycleStatus;
    lifecycle_changed_on: string | null;
    lifecycle_notes: string | null;
  }>>`
    SELECT c.id AS component_id,
      c.lifecycle_status,
      c.lifecycle_changed_on::text,
      c.lifecycle_notes
    FROM components c
    INNER JOIN systems s ON s.id = c.system_id
    INNER JOIN assets a ON a.id = s.asset_id
    WHERE a.id = ${assetId} AND a.owner_id = ${ownerId}
    ORDER BY c.position, c.name;
  `;
  return rows.map((row) => ({
    componentId: row.component_id,
    status: row.lifecycle_status,
    changedOn: row.lifecycle_changed_on,
    notes: row.lifecycle_notes,
  }));
}

export async function updateComponentLifecycle(
  assetId: string,
  ownerId: string,
  componentId: string,
  status: EquipmentLifecycleStatus,
  changedOn: string | null,
  notes: string | null,
) {
  const rows = await database()`
    UPDATE components c
    SET lifecycle_status = ${status},
      lifecycle_changed_on = ${changedOn},
      lifecycle_notes = ${notes}
    FROM systems s
    INNER JOIN assets a ON a.id = s.asset_id
    WHERE c.id = ${componentId}
      AND c.system_id = s.id
      AND a.id = ${assetId}
      AND a.owner_id = ${ownerId}
    RETURNING c.id;
  `;
  return rows.length === 1;
}

export async function linkDocumentToComponent(
  assetId: string,
  ownerId: string,
  componentId: string,
  documentId: string,
  relationship: ComponentDocumentLink["relationship"],
) {
  const rows = await database()`
    INSERT INTO component_documents (component_id, document_id, asset_id, owner_id, relationship)
    SELECT c.id, d.id, a.id, a.owner_id, ${relationship}
    FROM components c
    INNER JOIN systems s ON s.id = c.system_id
    INNER JOIN assets a ON a.id = s.asset_id
    INNER JOIN documents d ON d.asset_id = a.id
    WHERE c.id = ${componentId}
      AND d.id = ${documentId}
      AND a.id = ${assetId}
      AND a.owner_id = ${ownerId}
      AND d.owner_id = ${ownerId}
    ON CONFLICT (component_id, document_id)
    DO UPDATE SET relationship = EXCLUDED.relationship
    RETURNING component_id;
  `;
  return rows.length === 1;
}

export async function unlinkDocumentFromComponent(
  assetId: string,
  ownerId: string,
  componentId: string,
  documentId: string,
) {
  const rows = await database()`
    DELETE FROM component_documents cd
    USING components c, systems s, assets a
    WHERE cd.component_id = ${componentId}
      AND cd.document_id = ${documentId}
      AND cd.asset_id = ${assetId}
      AND cd.owner_id = ${ownerId}
      AND c.id = cd.component_id
      AND s.id = c.system_id
      AND a.id = s.asset_id
      AND a.id = ${assetId}
      AND a.owner_id = ${ownerId}
    RETURNING cd.component_id;
  `;
  return rows.length === 1;
}
