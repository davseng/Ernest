import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";

export function AssetAppHeader({
  assetId,
  assetName,
  email,
}: {
  assetId: string;
  assetName: string;
  email?: string | null;
}) {
  const chatHref = `/?asset=${assetId}`;
  return (
    <header className="site-header asset-app-header">
      <div className="asset-app-header-left">
        <Link className="brand" href={chatHref} aria-label={`Ernest chat for ${assetName}`}>
          <span className="brand-mark" aria-hidden="true">E</span>
          <span className="brand-word">Ernest</span>
        </Link>
        <span className="asset-context" title={assetName}>{assetName}</span>
      </div>
      <nav className="asset-app-actions" aria-label={`${assetName} navigation`}>
        <Link className="chat-return" href={chatHref}>Chat</Link>
        <details className="manage-menu">
          <summary aria-label={`Manage ${assetName}`} title="Manage">☰</summary>
          <div className="manage-menu-panel">
            <p>Manage {assetName}</p>
            <Link href={`/assets/${assetId}/knowledge`}>Equipment</Link>
            <Link href={`/assets/${assetId}/inventory`}>Inventory</Link>
            <Link href={`/assets/${assetId}/procedures`}>Procedures & checklists</Link>
            <Link href={`/assets/${assetId}/documents`}>Documents</Link>
            <Link href={`/assets/${assetId}/photos`}>Photos</Link>
            <Link href={`/assets/${assetId}`}>Asset setup</Link>
            <a href={`/assets/${assetId}/export`}>Download backup</a>
          </div>
        </details>
        <AccountMenu email={email} compact />
      </nav>
    </header>
  );
}
