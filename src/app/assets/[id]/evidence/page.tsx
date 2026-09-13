import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AssetAppHeader } from "@/components/asset-app-header";
import { getAsset } from "@/data/assets";
import { getDocumentsForAsset } from "@/data/documents";
import { listPhotos } from "@/data/photos";

export const dynamic = "force-dynamic";

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const [asset, documents, photos] = await Promise.all([
    getAsset(id, session.user.id),
    getDocumentsForAsset(id, session.user.id),
    listPhotos(id, session.user.id),
  ]);
  if (!asset) notFound();

  const readyDocuments = documents.filter((document) => document.extractedAt && !document.extractionError).length;
  const needsReview = documents.length - readyDocuments;

  return <div className="app-shell">
    <AssetAppHeader assetId={id} assetName={asset.name} email={session.user.email} />
    <main className="page-wrap detail-wrap">
      <section className="page-heading compact-page-heading">
        <p className="eyebrow">Evidence</p>
        <h1>Source material for {asset.name}</h1>
        <p className="lede">Preserved documents and photos support what Ernest knows. Originals remain private and each evidence type keeps its own specialized workflow.</p>
      </section>

      <section className="systems-section">
        <div className="section-heading"><h2>Evidence library</h2><p>Choose the kind of source material you want to browse or add.</p></div>
        <div className="system-list">
          <article className="system-card">
            <div className="system-heading"><div><p className="eyebrow">Documents</p><h3>Document Vault</h3><p>Manuals, surveys, receipts, service records and other PDFs. Processed text can become searchable evidence for Ernest.</p></div><span>{documents.length}</span></div>
            <p className="muted">{readyDocuments} ready · {needsReview} need processing or review</p>
            <Link className="primary-button" href={`/assets/${id}/documents`}>Open documents →</Link>
          </article>
          <article className="system-card">
            <div className="system-heading"><div><p className="eyebrow">Photos</p><h3>Photo evidence</h3><p>Equipment, data plates, repairs, labels and other visual records. Photos can be associated with equipment and retain their private originals.</p></div><span>{photos.length}</span></div>
            <p className="muted">Photo understanding in Chat is planned for a future release.</p>
            <Link className="primary-button" href={`/assets/${id}/photos`}>Open photos →</Link>
          </article>
        </div>
      </section>
    </main>
  </div>;
}
