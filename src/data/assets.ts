import "server-only";

import { postgresAssetRepository } from "@/data/postgres-asset-repository";

export const getAssets = (ownerId: string) => postgresAssetRepository.findAllByOwner(ownerId);
export const getAsset = (id: string, ownerId: string) =>
  postgresAssetRepository.findByIdAndOwner(id, ownerId);
export const createAsset = postgresAssetRepository.createForOwner.bind(postgresAssetRepository);
export const updateAsset = postgresAssetRepository.updateForOwner.bind(postgresAssetRepository);
export const deleteAsset = postgresAssetRepository.deleteForOwner.bind(postgresAssetRepository);
export const createSystem = postgresAssetRepository.createSystemForOwner.bind(postgresAssetRepository);
export const updateSystem = postgresAssetRepository.updateSystemForOwner.bind(postgresAssetRepository);
export const deleteSystem = postgresAssetRepository.deleteSystemForOwner.bind(postgresAssetRepository);
export const createComponent = postgresAssetRepository.createComponentForOwner.bind(postgresAssetRepository);
export const updateComponent = postgresAssetRepository.updateComponentForOwner.bind(postgresAssetRepository);
export const deleteComponent = postgresAssetRepository.deleteComponentForOwner.bind(postgresAssetRepository);
