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

export async function getInventoryLocations(assetId: string, ownerId: string) {
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
