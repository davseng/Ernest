import { startBlankReview } from "../../review-actions";
import { AssetAppHeader } from "@/components/asset-app-header";
import { ReviewComposer } from "@/components/review-composer";
import { getDocumentForAsset } from "@/data/documents";
import { reviewPageContext } from "../../review-page";
export const dynamic = "force-dynamic";
export default async function NewReview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ document?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const { session, asset, ready } = await reviewPageContext(id);
  const doc = q.document
    ? await getDocumentForAsset(q.document, id, session.user.id)
    : null;
  return (
    <div className="app-shell">
      <AssetAppHeader
        assetId={id}
        assetName={asset.name}
        email={session.user.email}
      />
      <main className="page-wrap detail-wrap">
        <h1>Prepare an update</h1>
        {ready ? (
          <>
            <ReviewComposer
              assetId={id}
              initialRequest={
                doc
                  ? `Read ${doc.title} (document ${doc.id}). Prepare an editable review of the supported maintenance events, dates and any related record changes. Distinguish proposed work from completed repairs; leave unknowns blank.`
                  : ""
              }
            />
            <details>
              <summary>Start a form without the adviser</summary>
              <form action={startBlankReview.bind(null, id)}>
                <label>
                  Record type
                  <select name="kind">
                    <option value="maintenance">Maintenance event</option>
                    <option value="inventory">Inventory adjustment</option>
                    <option value="knowledge">Current knowledge</option>
                  </select>
                </label>
                <button>Open blank review form</button>
              </form>
            </details>
          </>
        ) : (
          <p>
            The new review schema is awaiting setup. No records will change
            until setup and your approval.
          </p>
        )}
      </main>
    </div>
  );
}
