import type { Sql } from "postgres";
import {
  parseSailPosition,
  SailPositionError,
  type SailPositionInput,
} from "../domain/sail-position";
export type SailPosition = SailPositionInput & {
  assetId: string;
  revision: number;
};
export type PublicSailPosition = Omit<SailPositionInput, "published"> & {
  assetName: string;
  photoCaption: string | null;
  photoAlt: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
};
const fields =
  'p.asset_id AS "assetId",p.place_label AS "placeLabel",p.reported_on::text AS "reportedOn",p.latitude,p.longitude,p.note,p.photo_id AS "photoId",p.published,p.revision';
const photoVisible =
  "m.ready AND m.published AND m.owner_id=p.owner_id AND m.asset_id=p.asset_id AND (m.voyage_id IS NULL OR EXISTS(SELECT 1 FROM sail_voyages v WHERE v.id=m.voyage_id AND v.published AND v.owner_id=p.owner_id AND v.asset_id=p.asset_id))";
export function createSailPositionStore(sql: Sql) {
  return {
    async available() {
      try {
        return (
          (
            await sql`SELECT to_regclass('public.sail_positions') IS NOT NULL AS ready`
          )[0]?.ready === true
        );
      } catch {
        return false;
      }
    },
    async ownerList(owner: string) {
      return sql.unsafe<SailPosition[]>(
        `SELECT ${fields} FROM sail_positions p JOIN assets a ON a.id=p.asset_id AND a.owner_id=p.owner_id WHERE p.owner_id=$1`,
        [owner],
      );
    },
    async publicLatest() {
      return (
        (
          await sql.unsafe<PublicSailPosition[]>(
            `SELECT a.name AS "assetName",p.place_label AS "placeLabel",p.reported_on::text AS "reportedOn",p.latitude,p.longitude,p.note,m.id AS "photoId",m.caption AS "photoCaption",m.alt_text AS "photoAlt",m.width AS "photoWidth",m.height AS "photoHeight" FROM sail_positions p JOIN assets a ON a.id=p.asset_id AND a.owner_id=p.owner_id LEFT JOIN sail_media m ON m.id=p.photo_id AND ${photoVisible} WHERE p.published=true ORDER BY p.updated_at DESC LIMIT 1`,
          )
        )[0] ?? null
      );
    },
    async save(
      owner: string,
      assetId: string,
      input: unknown,
      revision: number,
    ) {
      const p = parseSailPosition(input);
      if (!Number.isInteger(revision) || revision < 0)
        throw new SailPositionError("Reload before saving this report.");
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        if (
          !(
            await tx`SELECT id FROM assets WHERE id=${assetId} AND owner_id=${owner} FOR UPDATE`
          ).length
        )
          throw new SailPositionError("Vessel not found.");
        const [before] = await tx.unsafe<SailPosition[]>(
          `SELECT ${fields} FROM sail_positions p WHERE p.asset_id=$1 AND p.owner_id=$2 FOR UPDATE`,
          [assetId, owner],
        );
        if ((before?.revision ?? 0) !== revision)
          throw new SailPositionError(
            "This report changed. Reload before saving.",
          );
        if (
          p.photoId &&
          !(
            await tx.unsafe(
              `SELECT m.id FROM sail_media m WHERE m.id=$1 AND m.asset_id=$2 AND m.owner_id=$3 AND m.ready AND m.published AND (m.voyage_id IS NULL OR EXISTS(SELECT 1 FROM sail_voyages v WHERE v.id=m.voyage_id AND v.published AND v.asset_id=m.asset_id AND v.owner_id=m.owner_id))`,
              [p.photoId, assetId, owner],
            )
          ).length
        )
          throw new SailPositionError(
            "Choose a published photo belonging to this vessel.",
          );
        const result =
          await tx`INSERT INTO sail_positions(asset_id,owner_id,place_label,reported_on,latitude,longitude,note,photo_id,published,revision) VALUES(${assetId},${owner},${p.placeLabel},${p.reportedOn},${p.latitude},${p.longitude},${p.note},${p.photoId},${p.published},${revision + 1}) ON CONFLICT(asset_id) DO UPDATE SET place_label=excluded.place_label,reported_on=excluded.reported_on,latitude=excluded.latitude,longitude=excluded.longitude,note=excluded.note,photo_id=excluded.photo_id,published=excluded.published,revision=excluded.revision,updated_at=now() WHERE sail_positions.owner_id=excluded.owner_id RETURNING asset_id`;
        if (!result.length)
          throw new SailPositionError("Position report is unavailable.");
        return revision + 1;
      });
    },
  };
}
