import type { Sql } from "postgres";
import { randomUUID } from "node:crypto";
import {
  parseSailPhoto,
  SailPhotoValidationError,
  type SailPhotoInput,
} from "../domain/sail-photos";
export type SailPhoto = SailPhotoInput & {
  id: string;
  assetId: string;
  assetName: string;
  ready: boolean;
  width: number | null;
  height: number | null;
  revision: number;
};
export type PublicSailPhoto = Omit<
  SailPhoto,
  "assetId" | "ready" | "published" | "revision"
>;
type StoredPhoto = SailPhoto & { uploadKey: string; storageKey: string };
const uuid = (id: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const fields =
  'm.id,m.asset_id AS "assetId",a.name AS "assetName",m.voyage_id AS "voyageId",m.category,m.caption,m.alt_text AS "altText",m.ready,m.published,m.home_cover AS "homeCover",m.voyage_cover AS "voyageCover",m.position,m.width,m.height,m.revision';
const publicFields =
  'm.id,a.name AS "assetName",m.voyage_id AS "voyageId",m.category,m.caption,m.alt_text AS "altText",m.home_cover AS "homeCover",m.voyage_cover AS "voyageCover",m.position,m.width,m.height';
const visible =
  "m.ready=true AND m.published=true AND (m.voyage_id IS NULL OR EXISTS(SELECT 1 FROM sail_voyages v WHERE v.id=m.voyage_id AND v.asset_id=m.asset_id AND v.owner_id=m.owner_id AND v.published=true))";
export function createSailPhotoStore(sql: Sql) {
  async function owned(
    id: string,
    owner: string,
    tx: Sql = sql,
    lock = false,
  ): Promise<StoredPhoto | null> {
    if (!uuid(id)) return null;
    return (
      (
        await tx.unsafe<StoredPhoto[]>(
          `SELECT ${fields},m.upload_key AS "uploadKey",m.storage_key AS "storageKey" FROM sail_media m JOIN assets a ON a.id=m.asset_id AND a.owner_id=m.owner_id WHERE m.id=$1 AND m.owner_id=$2${lock ? " FOR UPDATE OF m" : ""}`,
          [id, owner],
        )
      )[0] ?? null
    );
  }
  async function vessel(
    tx: Sql,
    assetId: string,
    owner: string,
    voyageId: string | null,
  ) {
    if (
      !(
        await tx`SELECT id FROM assets WHERE id=${assetId} AND owner_id=${owner} FOR UPDATE`
      ).length
    )
      throw new SailPhotoValidationError("Vessel not found.");
    if (
      voyageId &&
      !(
        await tx`SELECT id FROM sail_voyages WHERE id=${voyageId} AND owner_id=${owner} AND asset_id=${assetId}`
      ).length
    )
      throw new SailPhotoValidationError("Choose a voyage for this vessel.");
  }
  return {
    owned,
    async available() {
      try {
        return (
          (
            await sql`SELECT to_regclass('public.sail_media') IS NOT NULL AS ready`
          )[0]?.ready === true
        );
      } catch {
        return false;
      }
    },
    async list(owner: string) {
      return sql.unsafe<SailPhoto[]>(
        `SELECT ${fields} FROM sail_media m JOIN assets a ON a.id=m.asset_id AND a.owner_id=m.owner_id WHERE m.owner_id=$1 ORDER BY m.position,m.created_at DESC`,
        [owner],
      );
    },
    async publicPhotos(voyageId: string | null = null) {
      if (voyageId && !uuid(voyageId)) return [];
      return sql.unsafe<PublicSailPhoto[]>(
        `SELECT ${publicFields} FROM sail_media m JOIN assets a ON a.id=m.asset_id AND a.owner_id=m.owner_id WHERE ${visible} AND m.voyage_id IS NOT DISTINCT FROM $1::uuid ORDER BY m.position,m.created_at`,
        [voyageId],
      );
    },
    async publicCovers() {
      return sql.unsafe<PublicSailPhoto[]>(
        `SELECT ${publicFields} FROM sail_media m JOIN assets a ON a.id=m.asset_id AND a.owner_id=m.owner_id WHERE ${visible} AND m.voyage_cover=true ORDER BY m.created_at`,
        [],
      );
    },
    async published(id: string) {
      if (!uuid(id)) return null;
      return (
        (
          await sql.unsafe<Array<{ id: string; storageKey: string }>>(
            `SELECT m.id,m.storage_key AS "storageKey" FROM sail_media m JOIN assets a ON a.id=m.asset_id AND a.owner_id=m.owner_id WHERE m.id=$1 AND ${visible}`,
            [id],
          )
        )[0] ?? null
      );
    },
    async prepare(owner: string, assetId: string, input: unknown) {
      const p = parseSailPhoto(input);
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        await vessel(tx, assetId, owner, p.voyageId);
        const id = randomUUID(),
          uploadKey = `sail-uploads/${owner}/${id}`,
          storageKey = `sail-public/${owner}/${id}.webp`;
        await tx`INSERT INTO sail_media(id,asset_id,owner_id,voyage_id,category,caption,alt_text,upload_key,storage_key,position) VALUES(${id},${assetId},${owner},${p.voyageId},${p.category},${p.caption},${p.altText},${uploadKey},${storageKey},${p.position})`;
        return { id, uploadKey, storageKey };
      });
    },
    async finalize(
      id: string,
      owner: string,
      write: (photo: StoredPhoto) => Promise<{ width: number; height: number }>,
    ) {
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        const p = await owned(id, owner, tx, true);
        if (!p) throw new SailPhotoValidationError("Photo not found.");
        if (p.ready) return;
        const { width, height } = await write(p);
        if (
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          width < 1 ||
          height < 1 ||
          width > 2000 ||
          height > 2000
        )
          throw new SailPhotoValidationError("Invalid web photo dimensions.");
        await tx`UPDATE sail_media SET ready=true,width=${width},height=${height} WHERE id=${id} AND owner_id=${owner}`;
      });
    },
    async update(
      id: string,
      owner: string,
      input: unknown,
      expectedRevision: number,
    ) {
      const p = parseSailPhoto(input);
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        const existing = await owned(id, owner, tx);
        if (!existing) throw new SailPhotoValidationError("Photo not found.");
        await vessel(tx, existing.assetId, owner, p.voyageId);
        const before = await owned(id, owner, tx, true);
        if (!before || before.revision !== expectedRevision)
          throw new SailPhotoValidationError(
            "This photo changed. Reload before saving.",
          );
        if (p.published && !before.ready)
          throw new SailPhotoValidationError(
            "Finish uploading the photo before publishing.",
          );
        if (p.homeCover)
          await tx`UPDATE sail_media SET home_cover=false,revision=revision+1 WHERE asset_id=${before.assetId} AND owner_id=${owner} AND home_cover AND id<>${id}`;
        if (p.voyageCover)
          await tx`UPDATE sail_media SET voyage_cover=false,revision=revision+1 WHERE voyage_id=${p.voyageId} AND owner_id=${owner} AND voyage_cover AND id<>${id}`;
        await tx`UPDATE sail_media SET voyage_id=${p.voyageId},category=${p.category},caption=${p.caption},alt_text=${p.altText},published=${p.published},home_cover=${p.homeCover},voyage_cover=${p.voyageCover},position=${p.position},revision=revision+1 WHERE id=${id}`;
      });
    },
    async remove(id: string, owner: string, expectedRevision: number) {
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        const p = await owned(id, owner, tx, true);
        if (!p || p.revision !== expectedRevision)
          throw new SailPhotoValidationError(
            "This photo changed. Reload before removing.",
          );
        await tx`DELETE FROM sail_media WHERE id=${id} AND owner_id=${owner}`;
        return { uploadKey: p.uploadKey, storageKey: p.storageKey };
      });
    },
  };
}
