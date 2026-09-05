export interface AssetDocument {
  id: string;
  assetId: string;
  title: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
}

export interface NewAssetDocument {
  title: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
}
