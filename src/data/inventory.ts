import "server-only";

import postgres from "postgres";

let dbClient: ReturnType<typeof postgres> | undefined;

function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  dbClient ??= postgres(url, { max: 5 });
  return dbClient;
}

export type InventoryItem = {
  id: string;
  name: string;
  quantity: string | null;
  details: string | null;
  sourceLabel: string | null;
  sourcePage: number | null;
  locations: string[];
};

export type InventoryLocation = {
  code: string;
  label: string | null;
  notes: string | null;
  itemCount: number;
};

export async function getInventoryItems(assetId: string, ownerId: string): Promise<InventoryItem[]> {
  const rows = await database()<Array<{
    id: string;
    name: string;
    quantity: string | null;
    details: string | null;
    source_label: string | null;
    source_page: number | null;
    locations: string[] | null;
  }>>`
    SELECT
      i.id,
      i.name,
      i.quantity::text,
      i.details,
      i.source_label,
      i.source_page,
      COALESCE(array_agg(l.code ORDER BY l.code) FILTER (WHERE l.code IS NOT NULL), ARRAY[]::text[]) AS locations
    FROM inventory_items i
    LEFT JOIN inventory_item_locations il ON il.item_id = i.id
    LEFT JOIN inventory_locations l ON l.id = il.location_id
    WHERE i.asset_id = ${assetId} AND i.owner_id = ${ownerId}
    GROUP BY i.id
    ORDER BY lower(i.name), i.name;
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    details: row.details,
    sourceLabel: row.source_label,
    sourcePage: row.source_page,
    locations: row.locations ?? [],
  }));
}

export async function getInventoryLocations(assetId: string, ownerId: string): Promise<InventoryLocation[]> {
  const rows = await database()<Array<{code:string;label:string|null;notes:string|null;item_count:number}>>`
    SELECT l.code, l.label, l.notes, count(il.item_id)::int AS item_count
    FROM inventory_locations l
    LEFT JOIN inventory_item_locations il ON il.location_id = l.id
    WHERE l.asset_id = ${assetId} AND l.owner_id = ${ownerId}
    GROUP BY l.id
    ORDER BY lower(l.code), l.code;
  `;
  return rows.map((row) => ({ code: row.code, label: row.label, notes: row.notes, itemCount: row.item_count }));
}

export async function addInventoryItem(
  assetId: string,
  ownerId: string,
  input: { name: string; quantity?: string | null; details?: string | null; locationCode?: string | null },
) {
  const db = database();
  const name = input.name.trim();
  if (!name) return false;
  const quantity = input.quantity?.trim() ? Number(input.quantity) : null;
  if (input.quantity?.trim() && !Number.isFinite(quantity)) return false;
  return db.begin(async (tx) => {
    const [item] = await tx<Array<{id:string}>>`
      INSERT INTO inventory_items (asset_id, owner_id, name, quantity, details, source_label)
      VALUES (${assetId}, ${ownerId}, ${name}, ${quantity}, ${input.details?.trim() || null}, 'Owner provided')
      RETURNING id
    `;
    if (!item) return false;
    if (input.locationCode) {
      const [location] = await tx<Array<{id:string}>>`
        SELECT id FROM inventory_locations
        WHERE asset_id=${assetId} AND owner_id=${ownerId} AND lower(code)=lower(${input.locationCode.trim()})
        LIMIT 1
      `;
      if (!location) throw new Error("Inventory location not found");
      await tx`INSERT INTO inventory_item_locations (item_id, location_id) VALUES (${item.id}, ${location.id}) ON CONFLICT DO NOTHING`;
    }
    return true;
  });
}

export async function updateInventoryItem(
  assetId: string,
  ownerId: string,
  itemId: string,
  input: { name?: string | null; quantity?: string | null; details?: string | null; locationCode?: string | null },
) {
  const db = database();
  return db.begin(async (tx) => {
    const [existing] = await tx<Array<{id:string}>>`
      SELECT id FROM inventory_items WHERE id=${itemId} AND asset_id=${assetId} AND owner_id=${ownerId} LIMIT 1
    `;
    if (!existing) return false;
    if (input.name?.trim()) await tx`UPDATE inventory_items SET name=${input.name.trim()}, updated_at=now() WHERE id=${itemId}`;
    if (input.quantity !== undefined && input.quantity !== null && input.quantity.trim()) {
      const quantity = Number(input.quantity);
      if (!Number.isFinite(quantity)) return false;
      await tx`UPDATE inventory_items SET quantity=${quantity}, updated_at=now() WHERE id=${itemId}`;
    }
    if (input.details !== undefined && input.details !== null) await tx`UPDATE inventory_items SET details=${input.details.trim() || null}, updated_at=now() WHERE id=${itemId}`;
    if (input.locationCode) {
      const [location] = await tx<Array<{id:string}>>`
        SELECT id FROM inventory_locations WHERE asset_id=${assetId} AND owner_id=${ownerId} AND lower(code)=lower(${input.locationCode.trim()}) LIMIT 1
      `;
      if (!location) throw new Error("Inventory location not found");
      await tx`DELETE FROM inventory_item_locations WHERE item_id=${itemId}`;
      await tx`INSERT INTO inventory_item_locations (item_id, location_id) VALUES (${itemId}, ${location.id})`;
    }
    return true;
  });
}
