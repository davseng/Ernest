import { AssetAppHeader } from "@/components/asset-app-header";
import { reviews } from "@/data/reviews";
import { reviewPageContext } from "../review-page";
export const dynamic = "force-dynamic";
export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, asset, ready } = await reviewPageContext(id);
  const pending = ready ? await reviews().pending(id, session.user.id) : [];
  const audit = ready ? await reviews().audit(id, session.user.id) : [];
  return (
    <div className="app-shell">
      <AssetAppHeader
        assetId={id}
        assetName={asset.name}
        email={session.user.email}
      />
      <main className="page-wrap detail-wrap">
        <h1>Updates and review trail</h1>
        <p>
          <a href={`/assets/${id}/reviews/new`}>Prepare an update</a>
        </p>
        {!ready ? (
          <p>New review setup is pending. Existing records are unchanged.</p>
        ) : null}
        <h2>Pending forms</h2>
        {pending.length ? (
          <ul>
            {pending.map((r) => (
              <li key={r.id}>
                <a href={`/assets/${id}/reviews/${r.id}`}>{r.request}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No pending updates.</p>
        )}
        <h2>Approved changes</h2>
        {audit.length ? (
          <ul>
            {audit.map((r) => (
              <li key={r.id}>
                <a href={`/assets/${id}/reviews/${r.review_id}`}>
                  Approved{" "}
                  {new Date(r.created_at).toLocaleString("en-US", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </a>{" "}
                — {r.changes.length} recorded change(s)
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No updates approved through the new workflow yet. Earlier records
            are retained.
          </p>
        )}
      </main>
    </div>
  );
}
