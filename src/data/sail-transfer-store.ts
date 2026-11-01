import type { Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { SailTransferError, parseSailTransfer } from "../domain/sail-transfer";
export function createSailTransferStore(sql: Sql) {
  async function empty(
    tx: Sql,
    owner: string,
    asset: string,
    staged: string[] = [],
  ) {
    if (
      !(
        await tx`SELECT id FROM assets WHERE id=${asset} AND owner_id=${owner} FOR UPDATE`
      ).length
    )
      throw new SailTransferError("Vessel not found.");
    const [counts] =
      await tx`SELECT (SELECT count(*) FROM sail_voyages WHERE asset_id=${asset})::int AS voyages,(SELECT count(*) FROM sail_positions WHERE asset_id=${asset})::int AS positions`;
    const rows = await tx<
      {
        id: string;
        ready: boolean;
        published: boolean;
        revision: number;
        voyage_id: string | null;
        owner_id: string;
      }[]
    >`SELECT id,ready,published,revision,voyage_id,owner_id FROM sail_media WHERE asset_id=${asset} FOR UPDATE`;
    if (
      counts.voyages ||
      counts.positions ||
      rows.length !== staged.length ||
      rows.some(
        (p) =>
          !staged.includes(p.id) ||
          !p.ready ||
          p.published ||
          p.revision !== 1 ||
          p.voyage_id ||
          p.owner_id !== owner,
      )
    )
      throw new SailTransferError(
        "This vessel already has Sail content or unfinished uploads. No existing content was replaced. Review it in the owner workspace before importing.",
      );
  }
  return {
    async checkEmpty(owner: string, asset: string) {
      await sql.begin(async (raw) =>
        empty(raw as unknown as Sql, owner, asset),
      );
    },
    async importContent(
      owner: string,
      asset: string,
      input: unknown,
      staged: { ref: string; id: string }[],
    ) {
      const data = parseSailTransfer(input);
      if (
        !Array.isArray(staged) ||
        staged.length !== data.photos.length ||
        new Set(staged.map((p) => p.id)).size !== staged.length ||
        new Set(staged.map((p) => p.ref)).size !== staged.length ||
        staged.some(
          (p) =>
            !data.photos.some((photo) => photo.ref === p.ref) ||
            !/^[a-f\d-]{36}$/i.test(p.id),
        )
      )
        throw new SailTransferError(
          "The uploaded photos do not match this file.",
        );
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        await empty(
          tx,
          owner,
          asset,
          staged.map((p) => p.id),
        );
        const voyages = new Map<string, string>(),
          photos = new Map(staged.map((p) => [p.ref, p.id]));
        for (const v of data.voyages) {
          const id = randomUUID();
          voyages.set(v.ref, id);
          await tx`INSERT INTO sail_voyages(id,asset_id,owner_id,title,summary,departure_port,arrival_port,departure_from,departure_to,arrival_estimate,timing_note,status,published,crew_expectations,passenger_expectations,boarding_notes) VALUES(${id},${asset},${owner},${v.title},${v.summary},${v.departurePort},${v.arrivalPort},${v.departureFrom},${v.departureTo},${v.arrivalEstimate},${v.timingNote},${v.status},${v.published},${v.crewExpectations},${v.passengerExpectations},${v.boardingNotes})`;
          const { ref: sourceRef, ...plan } = v;
          void sourceRef;
          await tx`INSERT INTO sail_changes(voyage_id,revision,after_record) VALUES(${id},1,${tx.json({ ...plan, id, assetId: asset, ownerId: owner, revision: 1 })})`;
        }
        for (const p of data.photos) {
          const id = photos.get(p.ref)!;
          await tx`UPDATE sail_media SET voyage_id=${p.voyageId ? voyages.get(p.voyageId)! : null},category=${p.category},caption=${p.caption},alt_text=${p.altText},published=${p.published},home_cover=${p.homeCover},voyage_cover=${p.voyageCover},position=${p.position},revision=revision+1 WHERE id=${id} AND owner_id=${owner} AND asset_id=${asset}`;
        }
        const p = data.position;
        if (p)
          await tx`INSERT INTO sail_positions(asset_id,owner_id,place_label,reported_on,latitude,longitude,note,photo_id,published) VALUES(${asset},${owner},${p.placeLabel},${p.reportedOn},${p.latitude},${p.longitude},${p.note},${p.photoId ? photos.get(p.photoId)! : null},${p.published})`;
        return {
          voyages: data.voyages.length,
          photos: data.photos.length,
          position: !!p,
        };
      });
    },
  };
}
