import "server-only";

import { postgresAssetRepository } from "@/data/postgres-asset-repository";

export const getAssets = () => postgresAssetRepository.findAll();
export const getAsset = (id: string) => postgresAssetRepository.findById(id);
