import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { AssetForm } from "@/components/asset-form";
import { DeleteButton } from "@/components/delete-button";
import { ErrorNotice } from "@/components/error-notice";
import { getAsset } from "@/data/assets";
import { editAsset, removeAsset } from "../../actions";

export default async function EditAssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params; const { error } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const asset = await getAsset(id, session.user.id);
  if (!asset) notFound();
  return <div className="app-shell"><header className="site-header"><Link className="brand" href="/"><span className="brand-mark">E</span>Ernest</Link><AccountMenu email={session.user.email} /></header>
    <main className="page-wrap form-page"><Link className="back-link" href={`/assets/${id}`}>← {asset.name}</Link><p className="eyebrow">Asset settings</p><h1>Edit asset</h1><ErrorNotice message={error} /><AssetForm action={editAsset.bind(null, id)} asset={asset} submitLabel="Save changes" />
    <section className="danger-zone"><div><h2>Delete asset</h2><p>Permanently removes this asset, its inventory, and its operating log.</p></div><form action={removeAsset.bind(null, id)}><DeleteButton label="Delete asset" confirmation={`Permanently delete ${asset.name} and all of its records?`} /></form></section></main></div>;
}
