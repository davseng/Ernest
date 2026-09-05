export interface AssetDocument {
  id: string;
  assetId: string;
  title: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
  extractedAt?: Date;
  pageCount?: number;
  extractionError?: string;
}

export interface NewAssetDocument {
  title: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
}

export interface ExtractedDocumentPage {
  pageNumber: number;
  text: string;
}
