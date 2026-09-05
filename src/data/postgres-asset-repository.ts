import "server-only";

import { randomUUID } from "node:crypto";
import postgres from "postgres";

import type { AssetRepository } from "@/data/asset-repository";
import type { Asset, AssetSystem, AssetType, Component } from "@/domain/assets";

type JoinedRow = {
  asset_id: string; asset_name: string; asset_type: AssetType; make: string; asset_model: string;
  year: number; summary: string; system_id: string | null; system_name: string | null;
  system_description: string | null; component_id: string | null; component_name: string | null;
  manufacturer: string | null; component_model: string | null; location: string | null; notes: string | null;
};

let client: ReturnType<typeof postgres> | undefined;

function database() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  client ??= postgres(databaseUrl, { max: 5 });
  return client;
}

function mapRows(rows: JoinedRow[]): Asset[] {
  const assets = new Map<string, Asset>();
  const systems = new Map<string, AssetSystem>();

  for (const row of rows) {
    let asset = assets.get(row.asset_id);
    if (!asset) {
      asset = { id: row.asset_id, name: row.asset_name, type: row.asset_type, make: row.make,
        model: row.asset_model, year: row.year, summary: row.summary, systems: [] };
      assets.set(asset.id, asset);
    }
    if (!row.system_id || !row.system_name || !row.system_description) continue;
    let system = systems.get(row.system_id);
    if (!system) {
      system = { id: row.system_id, assetId: row.asset_id, name: row.system_name,
        description: row.system_description, components: [] };
      systems.set(system.id, system);
      asset.systems.push(system);
    }
    if (row.component_id) {
      system.components.push({ id: row.component_id, systemId: row.system_id,
        name: row.component_name ?? "", manufacturer: row.manufacturer ?? "",
        model: row.component_model ?? "", location: row.location ?? "", notes: row.notes ?? "" } satisfies Component);
    }
  }
  return [...assets.values()];
}

const selectAssets = `
  SELECT a.id AS asset_id, a.name AS asset_name, a.type AS asset_type, a.make,
    a.model AS asset_model, a.year, a.summary, s.id AS system_id, s.name AS system_name,
    s.description AS system_description, c.id AS component_id, c.name AS component_name,
    c.manufacturer, c.model AS component_model, c.location, c.notes
  FROM assets a
  LEFT JOIN systems s ON s.asset_id = a.id
  LEFT JOIN components c ON c.system_id = s.id`;

export const postgresAssetRepository: AssetRepository = {
  async findAllByOwner(ownerId) {
    const rows = await database().unsafe<JoinedRow[]>(`${selectAssets} WHERE a.owner_id = $1 ORDER BY a.name, s.position, c.position`, [ownerId]);
    return mapRows(rows);
  },
  async findByIdAndOwner(id, ownerId) {
    const rows = await database().unsafe<JoinedRow[]>(`${selectAssets} WHERE a.id = $1 AND a.owner_id = $2 ORDER BY s.position, c.position`, [id, ownerId]);
    return mapRows(rows)[0];
  },
  async updateForOwner(id, ownerId, details) {
    const rows = await database()`
      UPDATE assets
      SET name = ${details.name}, type = ${details.type}, make = ${details.make},
        model = ${details.model}, year = ${details.year}, summary = ${details.summary}
      WHERE id = ${id} AND owner_id = ${ownerId}
      RETURNING id`;
    return rows.length === 1;
  },
  async createSystemForOwner(assetId, ownerId, details) {
    const rows = await database()`
      INSERT INTO systems (id, asset_id, name, description, position)
      SELECT ${randomUUID()}, a.id, ${details.name}, ${details.description},
        COALESCE((SELECT MAX(position) + 1 FROM systems WHERE asset_id = a.id), 0)
      FROM assets a
      WHERE a.id = ${assetId} AND a.owner_id = ${ownerId}
      RETURNING id`;
    return rows.length === 1;
  },
  async updateSystemForOwner(assetId, systemId, ownerId, details) {
    const rows = await database()`
      UPDATE systems s
      SET name = ${details.name}, description = ${details.description}
      FROM assets a
      WHERE s.id = ${systemId} AND s.asset_id = ${assetId}
        AND a.id = s.asset_id AND a.owner_id = ${ownerId}
      RETURNING s.id`;
    return rows.length === 1;
  },
  async deleteSystemForOwner(assetId, systemId, ownerId) {
    const rows = await database()`
      DELETE FROM systems s USING assets a
      WHERE s.id = ${systemId} AND s.asset_id = ${assetId}
        AND a.id = s.asset_id AND a.owner_id = ${ownerId}
      RETURNING s.id`;
    return rows.length === 1;
  },
};
