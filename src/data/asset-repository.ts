import "server-only";

import type { Asset, AssetDetails, ComponentDetails, SystemDetails } from "@/domain/assets";

export interface AssetRepository {
  findAllByOwner(ownerId: string): Promise<Asset[]>;
  findByIdAndOwner(id: string, ownerId: string): Promise<Asset | undefined>;
  updateForOwner(id: string, ownerId: string, details: AssetDetails): Promise<boolean>;
  createSystemForOwner(assetId: string, ownerId: string, details: SystemDetails): Promise<boolean>;
  updateSystemForOwner(assetId: string, systemId: string, ownerId: string, details: SystemDetails): Promise<boolean>;
  deleteSystemForOwner(assetId: string, systemId: string, ownerId: string): Promise<boolean>;
  createComponentForOwner(assetId: string, systemId: string, ownerId: string, details: ComponentDetails): Promise<boolean>;
  updateComponentForOwner(assetId: string, systemId: string, componentId: string, ownerId: string, details: ComponentDetails): Promise<boolean>;
  deleteComponentForOwner(assetId: string, systemId: string, componentId: string, ownerId: string): Promise<boolean>;
}
