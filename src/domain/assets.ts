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

export interface AssetDetails {
  name: string;
  type: AssetType;
  make: string;
  model: string;
  year: number;
  summary: string;
  registrationNumber?: string;
}

export interface SystemDetails {
  name: string;
  description: string;
}

export interface ComponentDetails {
  name: string;
  manufacturer: string;
  model: string;
  serialNumber?: string;
  location: string;
  notes: string;
}
