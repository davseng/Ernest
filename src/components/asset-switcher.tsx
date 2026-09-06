import Link from "next/link";

export function AssetSwitcher({
  assets,
  selectedAssetId,
}: {
  assets: { id: string; name: string; type: string }[];
  selectedAssetId: string;
}) {
  const selected = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];

  return (
    <details className="asset-switcher">
      <summary>
        <span className="asset-switcher-label">{selected?.name ?? "Choose asset"}</span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="asset-switcher-menu">
        <p className="asset-switcher-heading">Assets</p>
        {assets.map((asset) => (
          <Link
            className={asset.id === selectedAssetId ? "asset-switcher-item active" : "asset-switcher-item"}
            href={`/?asset=${encodeURIComponent(asset.id)}`}
            key={asset.id}
          >
            <span>{asset.name}</span>
            <small>{asset.type}</small>
          </Link>
        ))}
      </div>
    </details>
  );
}
