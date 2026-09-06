import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccountMenu } from "@/components/account-menu";
import { AssetSwitcher } from "@/components/asset-switcher";
import { ErnestChat } from "@/components/ernest-chat";
import { getAssets } from "@/data/assets";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ asset?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const assets = await getAssets(session.user.id);
  const query = searchParams ? await searchParams : undefined;

  if (assets.length === 0) {
    return (
      <div className="app-shell">
        <header className="site-header conversational-header">
          <Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
          <AccountMenu email={session.user.email} />
        </header>
        <main className="empty-conversation-home">
          <h1>Ernest needs an asset to get started.</h1>
          <p>Add an asset first, then Ernest can organize its knowledge and become the day-to-day interface for it.</p>
        </main>
      </div>
    );
  }

  const selectedAsset = assets.find((asset) => asset.id === query?.asset) ?? assets[0];

  return (
    <div className="app-shell conversational-shell">
      <header className="site-header conversational-header">
        <div className="conversation-header-left">
          <Link className="brand" href="/" aria-label="Ernest home"><span className="brand-mark" aria-hidden="true">E</span>Ernest</Link>
          <AssetSwitcher
            assets={assets.map((asset) => ({ id: asset.id, name: asset.name, type: asset.type }))}
            selectedAssetId={selectedAsset.id}
          />
        </div>
        <nav className="conversation-nav" aria-label="Asset tools">
          <Link href={`/assets/${selectedAsset.id}/documents`}>Documents</Link>
          <Link href={`/assets/${selectedAsset.id}`}>Asset</Link>
          <AccountMenu email={session.user.email} />
        </nav>
      </header>

      <main className="conversation-main">
        <ErnestChat assetId={selectedAsset.id} assetName={selectedAsset.name} />
      </main>
    </div>
  );
}
