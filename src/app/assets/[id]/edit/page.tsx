import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { AssetAppHeader } from "@/components/asset-app-header";
import { AssetEditForm } from "@/components/asset-edit-form";
import { ErrorNotice } from "@/components/error-notice";
import { getAsset } from "@/data/assets";
import { editAsset } from "./actions";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}){
  const{id}=await params;const{error}=await searchParams;const session=await auth();if(!session?.user?.id)redirect("/sign-in");const asset=await getAsset(id,session.user.id);if(!asset)notFound();
  return <div className="app-shell"><AssetAppHeader assetId={asset.id} assetName={asset.name} email={session.user.email}/><main className="page-wrap form-page"><section className="page-heading compact-page-heading"><p className="eyebrow">Asset settings · {asset.name}</p><h1>Edit asset</h1><p className="lede">Core owner-controlled identity for this asset.</p></section><ErrorNotice message={error}/><AssetEditForm asset={asset} action={editAsset.bind(null,asset.id)}/></main></div>;
}
