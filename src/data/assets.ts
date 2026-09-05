import "server-only";

import { postgresAssetRepository } from "@/data/postgres-asset-repository";

export const getAssets = (ownerId: string) => postgresAssetRepository.findAllByOwner(ownerId);
export const getAsset = (id: string, ownerId: string) =>
  postgresAssetRepository.findByIdAndOwner(id, ownerId);
export const updateAsset = postgresAssetRepository.updateForOwner.bind(postgresAssetRepository);
export const createSystem = postgresAssetRepository.createSystemForOwner.bind(postgresAssetRepository);
export const updateSystem = postgresAssetRepository.updateSystemForOwner.bind(postgresAssetRepository);
export const deleteSystem = postgresAssetRepository.deleteSystemForOwner.bind(postgresAssetRepository);
