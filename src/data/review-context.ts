import "server-only";
import { getComponentLifecycles } from "./equipment-knowledge";
import { listPhotos } from "./photos";
import { getAsset } from "./assets";
import { getInventoryItems, getInventoryLocations } from "./inventory";
import { getLogEntries } from "./log-entries";
import { getOwnerKnowledge } from "./knowledge";
import { getDocumentsForAsset } from "./documents";
import { getAssetFindings } from "./document-findings";
import { getProcedures } from "./procedures";
import { reviews } from "./reviews";
export async function reviewContext(assetId: string, ownerId: string) {
  const asset = await getAsset(assetId, ownerId);
  if (!asset) throw Error("Asset not found.");
  const [
    inventory,
    locations,
    logs,
    knowledge,
    documents,
    findings,
    procedures,
    maintenance,
    survey,
    lifecycles,
    photos,
  ] = await Promise.all([
    getInventoryItems(assetId, ownerId),
    getInventoryLocations(assetId, ownerId),
    getLogEntries(assetId, ownerId),
    getOwnerKnowledge(assetId, ownerId),
    getDocumentsForAsset(assetId, ownerId),
    getAssetFindings(assetId, ownerId, 160),
    getProcedures(assetId, ownerId),
    reviews().events(assetId, ownerId),
    reviews().survey(assetId, ownerId),
    getComponentLifecycles(assetId, ownerId),
    listPhotos(assetId, ownerId),
  ]);
  return {
    asset,
    inventory,
    locations,
    logs: logs.slice(0, 200),
    knowledge,
    documents,
    findings,
    procedures,
    maintenance,
    survey,
    lifecycles,
    photos: photos.map((p) => ({
      id: p.id,
      title: p.title,
      componentName: p.componentName,
      notes: p.notes,
      originalFilename: p.originalFilename,
    })),
  };
}
export type ReviewContext = Awaited<ReturnType<typeof reviewContext>>;
