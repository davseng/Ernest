import type { Sql } from "postgres";
import { createHash, randomBytes } from "node:crypto";
import {
  parseVoyage,
  parsePerson,
  sailText,
  type VoyageInput,
  type ParticipationRole,
} from "../domain/sail";
export type Voyage = VoyageInput & {
  id: string;
  assetId: string;
  ownerId: string;
  assetName: string;
  revision: number;
};
export type PublicVoyage = Pick<
  Voyage,
  | "id"
  | "title"
  | "summary"
  | "departurePort"
  | "arrivalPort"
  | "departureFrom"
  | "departureTo"
  | "arrivalEstimate"
  | "timingNote"
  | "status"
  | "revision"
  | "assetName"
>;
export type Participant = {
  id: string;
  voyageId: string;
  fullName: string;
  email: string;
  role: ParticipationRole;
  status: "invited" | "accepted" | "declined" | "cancelled";
  deliveryStatus: string;
  lastSentAt: Date | null;
  acceptedRevision: number | null;
  revision: number;
};
export type GuestInvitation = {
  participant: Pick<
    Participant,
    "id" | "fullName" | "role" | "status" | "acceptedRevision" | "revision"
  >;
  voyage: PublicVoyage;
  expectations: string;
  boardingNotes: string;
};
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const tokenValid = (token: string) => /^[a-f0-9]{64}$/.test(token);
const uuid = (id: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
const revision = (v: unknown) => {
  if (!Number.isInteger(v) || Number(v) < 1)
    throw Error("Reload the latest version before saving.");
  return Number(v);
};
// Explicit projections are deliberate: public pages never receive guidance,
// private joining notes, owners, participants, email addresses or audit snapshots.
const publicFields =
  'v.id,v.title,v.summary,v.departure_port AS "departurePort",v.arrival_port AS "arrivalPort",v.departure_from::text AS "departureFrom",v.departure_to::text AS "departureTo",v.arrival_estimate::text AS "arrivalEstimate",v.timing_note AS "timingNote",v.status,v.revision,a.name AS "assetName"';
const privateFields =
  publicFields +
  ',v.asset_id AS "assetId",v.owner_id AS "ownerId",v.published,v.crew_expectations AS "crewExpectations",v.passenger_expectations AS "passengerExpectations",v.boarding_notes AS "boardingNotes"';
const participantFields =
  'p.id,p.voyage_id AS "voyageId",p.full_name AS "fullName",p.email,p.role,p.status,p.delivery_status AS "deliveryStatus",p.last_sent_at AS "lastSentAt",p.accepted_revision AS "acceptedRevision",p.revision';
export function createSailStore(sql: Sql) {
  async function ownerVoyage(
    id: string,
    ownerId: string,
    conn: Sql = sql,
    lock = false,
  ): Promise<Voyage | null> {
    if (!uuid(id)) return null;
    const rows = await conn.unsafe<Voyage[]>(
      `SELECT ${privateFields} FROM sail_voyages v JOIN assets a ON a.id=v.asset_id WHERE v.id=$1 AND v.owner_id=$2 AND a.owner_id=$2${lock ? " FOR UPDATE OF v" : ""}`,
      [id, ownerId],
    );
    return rows[0] ?? null;
  }
  async function guest(
    token: string,
    conn: Sql = sql,
    lock = false,
  ): Promise<GuestInvitation | null> {
    if (!tokenValid(token)) return null;
    const rows = await conn.unsafe<
      Array<
        PublicVoyage & {
          participantId: string;
          fullName: string;
          role: ParticipationRole;
          participantStatus: Participant["status"];
          acceptedRevision: number | null;
          participantRevision: number;
          expectations: string;
          boardingNotes: string;
        }
      >
    >(
      `SELECT ${publicFields},p.id AS "participantId",p.full_name AS "fullName",p.role,p.status AS "participantStatus",p.accepted_revision AS "acceptedRevision",p.revision AS "participantRevision",CASE WHEN p.role='crew' THEN v.crew_expectations ELSE v.passenger_expectations END AS expectations,v.boarding_notes AS "boardingNotes" FROM sail_participants p JOIN sail_voyages v ON v.id=p.voyage_id JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE p.token_hash=$1 AND p.token_expires_at>now() AND p.status<>'cancelled'${lock ? " FOR UPDATE OF p,v" : ""}`,
      [digest(token)],
    );
    const row = rows[0];
    if (!row) return null;
    const {
      participantId,
      fullName,
      role,
      participantStatus,
      acceptedRevision,
      participantRevision,
      expectations,
      boardingNotes,
      ...voyage
    } = row;
    return {
      participant: {
        id: participantId,
        fullName,
        role,
        status: participantStatus,
        acceptedRevision,
        revision: participantRevision,
      },
      voyage,
      expectations,
      boardingNotes,
    };
  }
  return {
    ownerVoyage,
    guest,
    async available() {
      try {
        return (
          (
            await sql`SELECT to_regclass('public.sail_voyages') IS NOT NULL AND to_regclass('public.sail_participants') IS NOT NULL AND to_regclass('public.sail_changes') IS NOT NULL AND to_regclass('public.sail_interest') IS NOT NULL AS ready`
          )[0]?.ready === true
        );
      } catch {
        return false;
      }
    },
    async publicList() {
      return sql.unsafe<PublicVoyage[]>(
        `SELECT ${publicFields} FROM sail_voyages v JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE v.published=true ORDER BY v.departure_from ASC NULLS LAST,v.created_at DESC`,
      );
    },
    async publicVoyage(id: string) {
      if (!uuid(id)) return null;
      return (
        (
          await sql.unsafe<PublicVoyage[]>(
            `SELECT ${publicFields} FROM sail_voyages v JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE v.id=$1 AND v.published=true`,
            [id],
          )
        )[0] ?? null
      );
    },
    async ownerList(ownerId: string) {
      return sql.unsafe<Voyage[]>(
        `SELECT ${privateFields} FROM sail_voyages v JOIN assets a ON a.id=v.asset_id WHERE v.owner_id=$1 AND a.owner_id=$1 ORDER BY v.updated_at DESC`,
        [ownerId],
      );
    },
    async save(
      ownerId: string,
      assetId: string,
      id: string | null,
      input: unknown,
      expectedRevision?: number,
    ) {
      const v = parseVoyage(input);
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        if (
          (
            await tx`SELECT id FROM assets WHERE id=${assetId} AND owner_id=${ownerId} FOR UPDATE`
          ).length !== 1
        )
          throw Error("Vessel not found.");
        const before = id ? await ownerVoyage(id, ownerId, tx, true) : null;
        if (id && (!before || before.assetId !== assetId))
          throw Error("Voyage not found.");
        if (before && before.revision !== revision(expectedRevision))
          throw Error("This voyage changed. Reload before saving.");
        if (before && JSON.stringify(parseVoyage(before)) === JSON.stringify(v))
          return before.id;
        const next = (before?.revision ?? 0) + 1;
        const [row] = id
          ? await tx<
              { id: string }[]
            >`UPDATE sail_voyages SET title=${v.title},summary=${v.summary},departure_port=${v.departurePort},arrival_port=${v.arrivalPort},departure_from=${v.departureFrom},departure_to=${v.departureTo},arrival_estimate=${v.arrivalEstimate},timing_note=${v.timingNote},status=${v.status},published=${v.published},crew_expectations=${v.crewExpectations},passenger_expectations=${v.passengerExpectations},boarding_notes=${v.boardingNotes},revision=${next},updated_at=now() WHERE id=${id} RETURNING id`
          : await tx<
              { id: string }[]
            >`INSERT INTO sail_voyages(asset_id,owner_id,title,summary,departure_port,arrival_port,departure_from,departure_to,arrival_estimate,timing_note,status,published,crew_expectations,passenger_expectations,boarding_notes) VALUES(${assetId},${ownerId},${v.title},${v.summary},${v.departurePort},${v.arrivalPort},${v.departureFrom},${v.departureTo},${v.arrivalEstimate},${v.timingNote},${v.status},${v.published},${v.crewExpectations},${v.passengerExpectations},${v.boardingNotes}) RETURNING id`;
        await tx`INSERT INTO sail_changes(voyage_id,revision,before_record,after_record) VALUES(${row.id},${next},${before ? tx.json(before) : null},${tx.json(v)})`;
        return row.id;
      });
    },
    async participants(id: string, ownerId: string) {
      if (!(await ownerVoyage(id, ownerId))) throw Error("Voyage not found.");
      return sql.unsafe<Participant[]>(
        `SELECT ${participantFields} FROM sail_participants p WHERE p.voyage_id=$1 ORDER BY p.created_at`,
        [id],
      );
    },
    async addPerson(id: string, ownerId: string, input: unknown) {
      const p = parsePerson(input);
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        if (!(await ownerVoyage(id, ownerId, tx, true)))
          throw Error("Voyage not found.");
        if (
          (
            await tx`SELECT id FROM sail_participants WHERE voyage_id=${id} AND email=${p.email}`
          ).length
        )
          throw Error(
            "This person is already on the list. Use their existing invitation.",
          );
        const [person] = await tx<
          { id: string }[]
        >`INSERT INTO sail_participants(voyage_id,full_name,email,role) VALUES(${id},${p.fullName},${p.email},${p.role}) RETURNING id`;
        return person.id;
      });
    },
    async updatePerson(
      id: string,
      ownerId: string,
      participantId: string,
      input: unknown,
      expectedRevision: number,
    ) {
      const p = parsePerson(input);
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        if (!(await ownerVoyage(id, ownerId, tx, true)))
          throw Error("Voyage not found.");
        const [before] = await tx<
          { id: string; revision: number }[]
        >`SELECT id,revision FROM sail_participants WHERE id=${participantId} AND voyage_id=${id} FOR UPDATE`;
        if (!before || before.revision !== revision(expectedRevision))
          throw Error("This person changed. Reload before saving.");
        if (
          (
            await tx`SELECT id FROM sail_participants WHERE voyage_id=${id} AND email=${p.email} AND id<>${participantId}`
          ).length
        )
          throw Error("This email is already on the voyage list.");
        await tx`UPDATE sail_participants SET full_name=${p.fullName},email=${p.email},role=${p.role},status='invited',token_hash=NULL,token_expires_at=NULL,delivery_status='not_sent',accepted_revision=NULL,revision=revision+1 WHERE id=${participantId}`;
      });
    },
    async cancelPerson(
      id: string,
      ownerId: string,
      participantId: string,
      expectedRevision: number,
    ) {
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        if (!(await ownerVoyage(id, ownerId, tx, true)))
          throw Error("Voyage not found.");
        const rows =
          await tx`UPDATE sail_participants SET status='cancelled',token_hash=NULL,token_expires_at=NULL,revision=revision+1 WHERE id=${participantId} AND voyage_id=${id} AND revision=${revision(expectedRevision)} RETURNING id`;
        if (!rows.length)
          throw Error("This invitation changed. Reload before cancelling.");
      });
    },
    async issue(id: string, ownerId: string, participantId: string) {
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        const voyage = await ownerVoyage(id, ownerId, tx, true);
        if (!voyage) throw Error("Voyage not found.");
        if (["cancelled", "completed"].includes(voyage.status))
          throw Error("This voyage is closed to invitations.");
        const [p] = await tx<
          {
            id: string;
            email: string;
            full_name: string;
            role: ParticipationRole;
            last_attempt_at: Date | null;
          }[]
        >`SELECT id,email,full_name,role,last_attempt_at FROM sail_participants WHERE id=${participantId} AND voyage_id=${id} AND status<>'cancelled' FOR UPDATE`;
        if (!p) throw Error("Invitation not found.");
        if (
          p.last_attempt_at &&
          new Date(p.last_attempt_at).getTime() > Date.now() - 60000
        )
          throw Error("Wait a minute before sending this invitation again.");
        const token = randomBytes(32).toString("hex"),
          hash = digest(token);
        await tx`UPDATE sail_participants SET token_hash=${hash},token_expires_at=now()+interval '30 days',last_attempt_at=now(),delivery_status='pending',revision=revision+1 WHERE id=${participantId}`;
        return {
          token,
          hash,
          email: p.email,
          fullName: p.full_name,
          role: p.role,
          voyage,
        };
      });
    },
    async recordDelivery(
      id: string,
      ownerId: string,
      participantId: string,
      hash: string,
      sent: boolean,
    ) {
      if (!(await ownerVoyage(id, ownerId))) throw Error("Voyage not found.");
      await sql`UPDATE sail_participants SET delivery_status=${sent ? "sent" : "failed"},last_sent_at=CASE WHEN ${sent} THEN now() ELSE last_sent_at END WHERE id=${participantId} AND voyage_id=${id} AND token_hash=${hash}`;
    },
    async respond(
      token: string,
      status: unknown,
      voyageRevision: number,
      participantRevision: number,
    ) {
      if (status !== "accepted" && status !== "declined")
        throw Error("Choose accept or decline.");
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        const g = await guest(token, tx, true);
        if (!g)
          throw Error(
            "This invitation is unavailable or expired. Ask the skipper for a new link.",
          );
        if (["cancelled", "completed"].includes(g.voyage.status))
          throw Error("This voyage is closed to responses.");
        if (g.voyage.revision !== revision(voyageRevision))
          throw Error(
            "The voyage plan changed. Reload and review it before responding.",
          );
        if (
          g.participant.status === status &&
          (status === "declined" ||
            g.participant.acceptedRevision === g.voyage.revision)
        )
          return;
        if (g.participant.revision !== revision(participantRevision))
          throw Error("Your response changed. Reload before responding again.");
        await tx`UPDATE sail_participants SET status=${status},accepted_revision=${status === "accepted" ? g.voyage.revision : null},revision=revision+1 WHERE id=${g.participant.id}`;
      });
    },
    async interest(id: string, input: unknown, requesterHash: string) {
      const p = parsePerson(input);
      const r = input as Record<string, unknown>;
      const message = sailText(r.message, 2000, "Message");
      if (sailText(r.website, 1000, "Website")) return;
      if (!/^[a-f0-9]{64}$/.test(requesterHash))
        throw Error("Please try again.");
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        // Lock both rate identities in stable order, including submissions across voyages.
        for (const rateKey of [
          `sail-ip:${requesterHash}`,
          `sail-email:${p.email}`,
        ].sort())
          await tx`SELECT pg_advisory_xact_lock(hashtext(${rateKey}))`;
        // Also prevent a publication/status change racing this submission.
        const [v] =
          await tx`SELECT v.id FROM sail_voyages v JOIN assets a ON a.id=v.asset_id AND a.owner_id=v.owner_id WHERE v.id=${id} AND v.published=true AND v.status NOT IN ('completed','cancelled') FOR UPDATE OF v`;
        if (!v) throw Error("This voyage is not accepting enquiries.");
        const [{ count }] = await tx<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM sail_interest WHERE created_at>now()-interval '1 hour' AND (requester_hash=${requesterHash} OR email=${p.email})`;
        if (count >= 3)
          throw Error("Please wait before sending another enquiry.");
        await tx`INSERT INTO sail_interest(voyage_id,full_name,email,role,message,requester_hash) VALUES(${id},${p.fullName},${p.email},${p.role},${message},${requesterHash})`;
      });
    },
    async enquiries(id: string, ownerId: string) {
      if (!(await ownerVoyage(id, ownerId))) throw Error("Voyage not found.");
      return sql<
        {
          id: string;
          full_name: string;
          email: string;
          role: ParticipationRole;
          message: string;
          reviewed: boolean;
        }[]
      >`SELECT id,full_name,email,role,message,reviewed FROM sail_interest WHERE voyage_id=${id} ORDER BY created_at DESC`;
    },
    async reviewEnquiry(id: string, ownerId: string, enquiryId: string) {
      if (!(await ownerVoyage(id, ownerId))) throw Error("Voyage not found.");
      await sql`UPDATE sail_interest SET reviewed=true WHERE id=${enquiryId} AND voyage_id=${id}`;
    },
  };
}
