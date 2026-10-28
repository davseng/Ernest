import { AssetAppHeader } from "@/components/asset-app-header";
import { reviews } from "@/data/reviews";
import { getLogEntries } from "@/data/log-entries";
import { reviewPageContext } from "../review-page";
import { prepareMaintenanceCorrection } from "../review-actions";
export const dynamic = "force-dynamic";
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, asset, ready } = await reviewPageContext(id);
  const events = ready ? await reviews().events(id, session.user.id) : [];
  const legacy = (await getLogEntries(id, session.user.id)).filter(
    (e) => e.entryType === "maintenance",
  );
  return (
    <div className="app-shell">
      <AssetAppHeader
        assetId={id}
        assetName={asset.name}
        email={session.user.email}
      />
      <main className="page-wrap detail-wrap">
        <h1>Maintenance history</h1>
        <p>
          <a href={`/assets/${id}/reviews/new`}>
            Record maintenance or prepare a correction
          </a>{" "}
          · <a href={`/assets/${id}/reviews`}>Approval and correction trail</a>
        </p>
        <p>
          Events below were approved by you. Unknown work dates stay unknown;
          approval time is not the repair date.
        </p>
        {!ready ? (
          <p>
            New review setup is pending. Earlier maintenance logs remain
            available below.
          </p>
        ) : null}
        {events.map((e) => (
          <article className="systems-section" key={e.id}>
            <h2>{e.title}</h2>
            <p>
              {e.occurred_on ?? "Work date unknown"} · revision {e.revision}
            </p>
            <p>{e.description}</p>
            <p>
              Equipment:{" "}
              {asset.systems
                .flatMap((s) => s.components)
                .find((c) => c.id === e.component_id)?.name ??
                "Unassigned / unknown"}{" "}
              · Engine hours: {e.engine_hours ?? "unknown"}
            </p>
            {e.spare_item_id ? (
              <p>
                Recorded spare consumption: {e.spare_used ?? "unknown"} · see
                the approval receipt for the balance change.
              </p>
            ) : null}
            {e.evidence.map((source, i) => (
              <p key={i}>
                <a
                  href={`/assets/${id}/documents/${source.documentId}/original#page=${source.pageNumber}`}
                >
                  Supporting original, p. {source.pageNumber}
                </a>
              </p>
            ))}
            <form action={prepareMaintenanceCorrection.bind(null, id, e.id)}>
              <button>Prepare correction</button>
            </form>
          </article>
        ))}
        {ready && !events.length ? (
          <p>No maintenance events approved in the new workflow yet.</p>
        ) : null}
        <h2>Earlier maintenance log entries</h2>
        <p>
          Existing records are preserved; they have not been silently converted
          or duplicated.
        </p>
        {legacy.map((e) => (
          <article key={e.id} className="systems-section">
            <h3>{e.title}</h3>
            <p>{new Date(e.occurredAt).toISOString().slice(0, 10)}</p>
            <p>{e.body}</p>
          </article>
        ))}
      </main>
    </div>
  );
}
