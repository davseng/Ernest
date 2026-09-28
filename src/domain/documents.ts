export type DocumentSourceType = "upload" | "url" | "google_drive";

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
  sourceExternalId?: string;
  contentHash?: string;
  documentType?: string;
  documentDate?: string;
  summary?: string;
  classifiedAt?: Date;
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
  sourceExternalId?: string;
  contentHash?: string;
  documentType?: string;
  documentDate?: string;
  summary?: string;
}

export interface ExtractedDocumentPage {
  pageNumber: number;
  text: string;
}
