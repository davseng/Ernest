export type DocumentSourceType = "upload" | "url";

export interface AssetDocument {
  id: string;
  assetId: string;
  title: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
  sourceType: DocumentSourceType;
  sourceUrl?: string;
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
  sourceType?: DocumentSourceType;
  sourceUrl?: string;
}

export interface ExtractedDocumentPage {
  pageNumber: number;
  text: string;
}
