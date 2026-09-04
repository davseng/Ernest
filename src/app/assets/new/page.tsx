import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { AssetForm } from "@/components/asset-form";
import { ErrorNotice } from "@/components/error-notice";
import { addAsset } from "../actions";

export default async function NewAssetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const { error } = await searchParams;
  return <div className="app-shell"><header className="site-header"><Link className="brand" href="/"><span className="brand-mark">E</span>Ernest</Link><AccountMenu email={session.user.email} /></header>
    <main className="page-wrap form-page"><Link className="back-link" href="/">← All assets</Link><p className="eyebrow">New record</p><h1>Add an asset</h1><p className="lede">Start with the identifying details. You can build its inventory next.</p><ErrorNotice message={error} /><AssetForm action={addAsset} submitLabel="Create asset" /></main></div>;
}
