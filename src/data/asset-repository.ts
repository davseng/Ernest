import "server-only";

import type { Asset } from "@/domain/assets";

export interface AssetRepository {
  findAll(): Promise<Asset[]>;
  findById(id: string): Promise<Asset | undefined>;
}
