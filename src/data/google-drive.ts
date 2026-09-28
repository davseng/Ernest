import "server-only";

import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;
function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  client ??= postgres(url, { max: 5 });
  return client;
}

const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

function config() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const appUrl = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/$/, "");
  if (!clientId || !clientSecret || !appUrl) return undefined;
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/google-drive/callback` };
}

export function googleDriveConfigured() { return Boolean(config()); }

export function googleDriveAuthorizationUrl(state: string) {
  const c = config();
  if (!c) throw new Error("Google Drive is not configured.");
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: SCOPES,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function exchangeGoogleCode(code: string) {
  const c = config();
  if (!c) throw new Error("Google Drive is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: c.clientId, client_secret: c.clientSecret,
      redirect_uri: c.redirectUri, grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("Google did not accept the Drive authorization.");
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

async function refreshAccessToken(refreshToken: string) {
  const c = config();
  if (!c) throw new Error("Google Drive is not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: c.clientId,
      client_secret: c.clientSecret, grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Google Drive authorization has expired. Reconnect Drive.");
  return response.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function saveGoogleDriveConnection(ownerId: string, token: { access_token: string; refresh_token?: string; expires_in: number }) {
  // Drive authorization does not require identity scopes. Keep the connection
  // deliberately limited to the Drive permission Ernest actually uses.
  const profile: { email?: string } = {};
  await database()`
    INSERT INTO external_connections (owner_id, provider, access_token, refresh_token, token_expires_at, provider_account_email)
    VALUES (${ownerId}, 'google_drive', ${token.access_token}, ${token.refresh_token ?? null}, now() + (${token.expires_in} * interval '1 second'), ${profile.email ?? null})
    ON CONFLICT (owner_id, provider) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, external_connections.refresh_token),
      token_expires_at = EXCLUDED.token_expires_at,
      provider_account_email = EXCLUDED.provider_account_email,
      updated_at = now()`;
}

export async function getGoogleDriveConnection(ownerId: string) {
  const rows = await database()<Array<{access_token:string|null;refresh_token:string|null;token_expires_at:Date|null;provider_account_email:string|null;folder_id:string|null;folder_name:string|null}>>`
    SELECT access_token, refresh_token, token_expires_at, provider_account_email, folder_id, folder_name
    FROM external_connections WHERE owner_id=${ownerId} AND provider='google_drive' LIMIT 1`;
  return rows[0];
}

async function accessToken(ownerId: string) {
  const connection = await getGoogleDriveConnection(ownerId);
  if (!connection) throw new Error("Connect Google Drive first.");
  if (connection.access_token && connection.token_expires_at && connection.token_expires_at.getTime() > Date.now() + 60_000) return connection.access_token;
  if (!connection.refresh_token) throw new Error("Reconnect Google Drive.");
  const refreshed = await refreshAccessToken(connection.refresh_token);
  await database()`UPDATE external_connections SET access_token=${refreshed.access_token}, token_expires_at=now()+(${refreshed.expires_in}*interval '1 second'), updated_at=now() WHERE owner_id=${ownerId} AND provider='google_drive'`;
  return refreshed.access_token;
}

async function driveGet(ownerId: string, url: string) {
  const token = await accessToken(ownerId);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
  return response;
}

export async function ensureErnestInbox(ownerId: string) {
  const connection = await getGoogleDriveConnection(ownerId);
  if (!connection) throw new Error("Connect Google Drive first.");
  if (connection.folder_id) return { id: connection.folder_id, name: connection.folder_name || "Ernest Inbox" };
  const q = encodeURIComponent("name='Ernest Inbox' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const response = await driveGet(ownerId, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=10`);
  const body = await response.json() as { files?: Array<{id:string;name:string}> };
  const folder = body.files?.[0];
  if (!folder) throw new Error('Create a Google Drive folder named "Ernest Inbox", then try again.');
  await database()`UPDATE external_connections SET folder_id=${folder.id}, folder_name=${folder.name}, updated_at=now() WHERE owner_id=${ownerId} AND provider='google_drive'`;
  return folder;
}

export async function listInboxPdfs(ownerId: string) {
  const folder = await ensureErnestInbox(ownerId);
  const q = encodeURIComponent(`'${folder.id}' in parents and trashed=false and mimeType='application/pdf'`);
  const response = await driveGet(ownerId, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,md5Checksum,webViewLink)&orderBy=modifiedTime desc&pageSize=100`);
  const body = await response.json() as { files?: Array<{id:string;name:string;mimeType:string;size?:string;modifiedTime?:string;md5Checksum?:string;webViewLink?:string}> };
  return body.files ?? [];
}

export async function downloadDrivePdf(ownerId: string, fileId: string) {
  const response = await driveGet(ownerId, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  return new Uint8Array(await response.arrayBuffer());
}
