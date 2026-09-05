import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let client: S3Client | undefined;

type StorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function storageConfig(): StorageConfig {
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = process.env.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET;

  const missing: string[] = [];
  if (!endpoint) missing.push("R2_ENDPOINT or R2_ACCOUNT_ID");
  if (!accessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("R2_BUCKET_NAME or R2_BUCKET");

  if (missing.length > 0) {
    throw new Error(`R2 storage is not configured. Missing: ${missing.join(", ")}.`);
  }

  return {
    endpoint: endpoint as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
  };
}

function storageClient() {
  if (client) return client;
  const config = storageConfig();
  client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

export async function storeDocument(key: string, file: File) {
  const config = storageConfig();
  const body = Buffer.from(await file.arrayBuffer());
  await storageClient().send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: file.type || "application/octet-stream",
  }));
}
