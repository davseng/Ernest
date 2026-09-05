import "server-only";

import type { Asset, AssetDetails, SystemDetails } from "@/domain/assets";

export interface AssetRepository {
  findAllByOwner(ownerId: string): Promise<Asset[]>;
  findByIdAndOwner(id: string, ownerId: string): Promise<Asset | undefined>;
  updateForOwner(id: string, ownerId: string, details: AssetDetails): Promise<boolean>;
  createSystemForOwner(assetId: string, ownerId: string, details: SystemDetails): Promise<boolean>;
  updateSystemForOwner(assetId: string, systemId: string, ownerId: string, details: SystemDetails): Promise<boolean>;
  deleteSystemForOwner(assetId: string, systemId: string, ownerId: string): Promise<boolean>;
}
