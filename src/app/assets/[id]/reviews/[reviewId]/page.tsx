import { notFound } from "next/navigation";
import { AssetAppHeader } from "@/components/asset-app-header";
import { ReviewHistory } from "@/components/review-history";
import { ReviewForm } from "@/components/review-form";
import { reviews } from "@/data/reviews";
import { getInventoryItems } from "@/data/inventory";
import { getDocumentsForAsset } from "@/data/documents";
import { reviewPageContext } from "../../review-page";
export const dynamic = "force-dynamic";
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string; reviewId: string }>;
}) {
  const { id, reviewId } = await params;
  const { session, asset, ready } = await reviewPageContext(id);
  if (!ready)
    return (
      <main className="page-wrap">
        <h1>Review setup pending</h1>
        <p>
          The new review schema must be installed before this form can be
          opened. No definitive records changed.
        </p>
      </main>
    );
  const review = await reviews().get(id, session.user.id, reviewId);
  if (!review) notFound();
  const history =
    review.status === "saved"
      ? await reviews().auditForReview(id, session.user.id, reviewId)
      : null;
  const [inventory, documents] = await Promise.all([
    getInventoryItems(id, session.user.id),
    getDocumentsForAsset(id, session.user.id),
  ]);
  return (
    <div className="app-shell">
      <AssetAppHeader
        assetId={id}
        assetName={asset.name}
        email={session.user.email}
      />
      <main className="page-wrap detail-wrap">
        <p>
          <a href={`/assets/${id}/reviews`}>All reviews</a> ·{" "}
          <a href={`/?asset=${id}`}>Back to chat</a>
        </p>
        <p>Original request: {review.request}</p>
        <ReviewForm
          assetId={id}
          reviewId={reviewId}
          initial={review.draft}
          status={review.status}
          savedReceipt={review.receipt}
          choices={{
            inventory,
            equipment: asset.systems.flatMap((s) =>
              s.components.map((c) => ({
                id: c.id,
                name: `${s.name}: ${c.name}`,
              })),
            ),
            documents,
          }}
        />
        {history ? <ReviewHistory changes={history.changes} /> : null}
      </main>
    </div>
  );
}
