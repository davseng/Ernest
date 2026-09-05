export type AssetType = "Boat" | "RV";

export interface Component {
  id: string;
  systemId: string;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  location: string;
  notes: string;
}

export interface AssetSystem {
  id: string;
  assetId: string;
  name: string;
  description: string;
  components: Component[];
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  make: string;
  model: string;
  year: number;
  summary: string;
  registrationNumber?: string;
  systems: AssetSystem[];
}

export type AssetDetails = Pick<Asset, "name" | "type" | "make" | "model" | "year" | "summary" | "registrationNumber">;
export type SystemDetails = Pick<AssetSystem, "name" | "description">;
export type ComponentDetails = Pick<Component, "name" | "manufacturer" | "model" | "serialNumber" | "location" | "notes">;
