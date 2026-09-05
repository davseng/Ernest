import "server-only";

import type { Asset, AssetDetails } from "@/domain/assets";

export interface AssetRepository {
  findAllByOwner(ownerId: string): Promise<Asset[]>;
  findByIdAndOwner(id: string, ownerId: string): Promise<Asset | undefined>;
  updateForOwner(id: string, ownerId: string, details: AssetDetails): Promise<boolean>;
}
