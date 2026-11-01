import type { Sql } from "postgres";
export type SailNotification = {
  id: string;
  summary: string;
  voyageId: string | null;
  title: string | null;
  category: string;
};
export function createSailNotificationStore(sql: Sql) {
  return {
    async available() {
      return (
        (
          await sql`SELECT to_regclass('public.sail_notifications') IS NOT NULL AS ready`
        )[0]?.ready === true
      );
    },
    async status(owner: string) {
      return sql<
        { state: string; count: number }[]
      >`SELECT state,count(*)::int AS count FROM sail_notifications WHERE owner_id=${owner} GROUP BY state`;
    },
    async claim(recipient: string, owner?: string) {
      return sql.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        return tx<
          SailNotification[]
        >`UPDATE sail_notifications SET state='sending',attempted_at=now() WHERE id IN (SELECT n.id FROM sail_notifications n JOIN users u ON u.id=n.owner_id WHERE n.state='pending' AND lower(u.email)=lower(${recipient}) AND (${owner ?? null}::uuid IS NULL OR n.owner_id=${owner ?? null}) ORDER BY n.created_at,n.id LIMIT 40 FOR UPDATE OF n SKIP LOCKED) RETURNING id,summary,voyage_id AS "voyageId",split_part(event_key,':',1) AS category,(SELECT v.title FROM sail_voyages v WHERE v.id=sail_notifications.voyage_id AND v.owner_id=sail_notifications.owner_id) AS title`;
      });
    },
    async complete(ids: string[], sent: boolean) {
      if (ids.length)
        await sql`UPDATE sail_notifications SET state=${sent ? "sent" : "failed"},sent_at=CASE WHEN ${sent} THEN now() ELSE sent_at END WHERE id=ANY(${ids}::uuid[]) AND state='sending'`;
    },
    async retryFailed(owner: string) {
      await sql`UPDATE sail_notifications SET state='pending' WHERE owner_id=${owner} AND state='failed'`;
    },
  };
}
