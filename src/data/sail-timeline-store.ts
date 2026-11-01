import type { Sql } from "postgres";
import {
  parseSailAvailability,
  type SailAvailability,
} from "../domain/sail-timeline";
export function createSailTimelineStore(sql: Sql) {
  return {
    async available() {
      return (
        (
          await sql`SELECT to_regclass('public.sail_availability') IS NOT NULL AS ready`
        )[0]?.ready === true
      );
    },
    async publicAvailability() {
      return sql<
        SailAvailability[]
      >`SELECT av.voyage_id AS "voyageId",av.crew_needed AS "crewNeeded",av.passenger_places AS "passengerPlaces",av.note,av.revision FROM sail_availability av JOIN sail_voyages v ON v.id=av.voyage_id AND v.owner_id=av.owner_id JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE v.published`;
    },
    async ownerAvailability(owner: string) {
      return sql<
        SailAvailability[]
      >`SELECT av.voyage_id AS "voyageId",av.crew_needed AS "crewNeeded",av.passenger_places AS "passengerPlaces",av.note,av.revision FROM sail_availability av JOIN sail_voyages v ON v.id=av.voyage_id AND v.owner_id=av.owner_id JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE v.owner_id=${owner}`;
    },
    async summary(owner: string) {
      return sql<
        {
          voyageId: string;
          acceptedCrew: number;
          acceptedPassengers: number;
          waiting: number;
          drafts: number;
          reconfirm: number;
          enquiries: number;
        }[]
      >`SELECT v.id AS "voyageId",(SELECT count(*)::int FROM sail_participants p WHERE p.voyage_id=v.id AND p.status='accepted' AND p.accepted_revision=v.revision AND p.role='crew') AS "acceptedCrew",(SELECT count(*)::int FROM sail_participants p WHERE p.voyage_id=v.id AND p.status='accepted' AND p.accepted_revision=v.revision AND p.role='passenger') AS "acceptedPassengers",(SELECT count(*)::int FROM sail_participants p WHERE p.voyage_id=v.id AND p.status='invited' AND p.token_hash IS NOT NULL) AS waiting,(SELECT count(*)::int FROM sail_participants p WHERE p.voyage_id=v.id AND p.status='invited' AND p.token_hash IS NULL) AS drafts,(SELECT count(*)::int FROM sail_participants p WHERE p.voyage_id=v.id AND p.status='accepted' AND p.accepted_revision IS DISTINCT FROM v.revision) AS reconfirm,(SELECT count(*)::int FROM sail_interest i WHERE i.voyage_id=v.id AND NOT i.reviewed) AS enquiries FROM sail_voyages v JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE v.owner_id=${owner}`;
    },
    async save(owner: string, id: string, input: unknown, revision: number) {
      const p = parseSailAvailability(input);
      if (!Number.isInteger(revision) || revision < 0)
        throw Error("Reload the trip before saving.");
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        if (
          !(
            await tx`SELECT v.id FROM sail_voyages v JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE v.id=${id} AND v.owner_id=${owner} FOR UPDATE OF v`
          ).length
        )
          throw Error("Trip not found.");
        const [old] = await tx<
          {
            crew_needed: number | null;
            passenger_places: number | null;
            note: string;
            revision: number;
          }[]
        >`SELECT crew_needed,passenger_places,note,revision FROM sail_availability WHERE voyage_id=${id} AND owner_id=${owner} FOR UPDATE`;
        if ((old?.revision ?? 0) !== revision)
          throw Error("Availability changed. Reload before saving.");
        if (
          old &&
          old.crew_needed === p.crewNeeded &&
          old.passenger_places === p.passengerPlaces &&
          old.note === p.note
        )
          return old.revision;
        const result =
          await tx`INSERT INTO sail_availability(voyage_id,owner_id,crew_needed,passenger_places,note,revision) VALUES(${id},${owner},${p.crewNeeded},${p.passengerPlaces},${p.note},${revision + 1}) ON CONFLICT(voyage_id) DO UPDATE SET crew_needed=excluded.crew_needed,passenger_places=excluded.passenger_places,note=excluded.note,revision=excluded.revision,updated_at=now() WHERE sail_availability.owner_id=excluded.owner_id RETURNING revision`;
        if (!result.length) throw Error("Availability is unavailable.");
        return revision + 1;
      });
    },
  };
}
