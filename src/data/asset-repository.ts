import "server-only";

import type { Asset } from "@/domain/assets";

export interface AssetRepository {
  findAllByOwner(ownerId: string): Promise<Asset[]>;
  findByIdAndOwner(id: string, ownerId: string): Promise<Asset | undefined>;
}
