export type AssetType = "Boat" | "RV";

export interface Component {
  id: string;
  systemId: string;
  name: string;
  manufacturer: string;
  model: string;
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
  systems: AssetSystem[];
}

export type AssetDetails = Pick<Asset, "name" | "type" | "make" | "model" | "year" | "summary">;
