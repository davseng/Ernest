import { AssetAppHeader } from "@/components/asset-app-header";
import { reviewPageContext } from "../review-page";
import { reviews } from "@/data/reviews";
export const dynamic = "force-dynamic";
export default async function SurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { asset, session, ready } = await reviewPageContext(id);
  const items = ready ? await reviews().survey(id, session.user.id) : [];
  const coverageRecords = ready
    ? await reviews().coverage(id, session.user.id)
    : [];
  let confirmed = false;
  for (const entry of coverageRecords) {
    const coverage = entry.receipt?.coverage;
    if (
      coverage?.confirmed &&
      coverage.items.length &&
      coverage.items.length === items.length &&
      items.every((i) =>
        coverage.items.some(
          (x) =>
            x.documentId === i.document_id && x.identifier === i.identifier,
        ),
      )
    ) {
      confirmed = true;
      break;
    }
  }
  return (
    <div className="app-shell">
      <AssetAppHeader
        assetId={id}
        assetName={asset.name}
        email={session.user.email}
      />
      <main className="page-wrap detail-wrap">
        <h1>Survey A and B status</h1>
        <p>
          {confirmed
            ? "You confirmed that this approved list covers every A/B item in the survey."
            : "Coverage is not confirmed. This is the approved list so far, not a claim that every A/B item has been captured."}
        </p>
        <p>
          <a href={`/assets/${id}/reviews/new`}>
            Prepare survey reconciliation
          </a>{" "}
          · <a href={`/assets/${id}/reviews`}>Review trail</a>
        </p>
        {!ready ? <p>New review setup is pending.</p> : null}
        {items.length ? (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Original finding</th>
                <th>Current approved status</th>
                <th>Reason and evidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.priority} {i.identifier}
                  </td>
                  <td>
                    {i.wording}
                    <p>
                      <a
                        href={`/assets/${id}/documents/${i.document_id}/original#page=${i.page_number}`}
                      >
                        Survey p. {i.page_number}
                      </a>
                    </p>
                  </td>
                  <td>
                    {i.status.replaceAll("_", " ")}
                    <p>revision {i.revision}</p>
                  </td>
                  <td>
                    {i.notes}
                    {i.evidence.map((e, n) => (
                      <p key={n}>
                        <a
                          href={`/assets/${id}/documents/${e.documentId}/original#page=${e.pageNumber}`}
                        >
                          Evidence p. {e.pageNumber}
                        </a>
                        {e.quote ? ` — ${e.quote}` : ""}
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>
            No A/B items have been approved through the new review workflow.
            Ernest must read the survey before preparing the list.
          </p>
        )}
        <p>
          “Repair documented” does not prove an issue is gone. “Owner confirmed
          resolved” records your decision. Original findings and correction
          history are retained.
        </p>
      </main>
    </div>
  );
}
