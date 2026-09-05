import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { AssetEditForm } from "@/components/asset-edit-form";
import { ErrorNotice } from "@/components/error-notice";
import { getAsset } from "@/data/assets";
import { editAsset } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
        <AccountMenu email={session.user.email} />
      </header>
      <main className="page-wrap form-page">
        <Link className="back-link" href={`/assets/${asset.id}`}>← {asset.name}</Link>
        <p className="eyebrow">Asset settings</p>
        <h1>Edit asset</h1>
        <ErrorNotice message={error} />
        <AssetEditForm asset={asset} action={editAsset.bind(null, asset.id)} />
      </main>
    </div>
  );
}
