import { AssetAppHeader } from "@/components/asset-app-header";
import { reviewPageContext } from "../review-page";
import { reviewContext } from "@/data/review-context";
import { boatSummary } from "@/domain/boat-summary";
export const dynamic = "force-dynamic";
export default async function SummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { asset, session, ready } = await reviewPageContext(id);
  const context = ready ? await reviewContext(id, session.user.id) : null;
  return (
    <div className="app-shell">
      <AssetAppHeader
        assetId={id}
        assetName={asset.name}
        email={session.user.email}
      />
      <main className="page-wrap detail-wrap">
        <h1>Boat knowledge</h1>
        <p>
          A readable view of confirmed records, generated on request. Update the
          records through a review form; this summary cannot drift into a second
          source of truth.
        </p>
        <p>
          <a href={`/assets/${id}/reviews/new`}>Prepare an update</a> ·{" "}
          <a href={`/assets/${id}/history`}>Maintenance history</a> ·{" "}
          <a href={`/assets/${id}/survey`}>Survey report</a> ·{" "}
          <a href={`/assets/${id}/reviews`}>Review trail</a>
        </p>
        {context ? (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
            {boatSummary(context)}
          </pre>
        ) : (
          <p>
            The new review schema is awaiting setup. Earlier records remain
            available in their existing views.
          </p>
        )}
      </main>
    </div>
  );
}
