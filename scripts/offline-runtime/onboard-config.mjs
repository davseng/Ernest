export function readOnboardConfig(env=process.env){
  const cloudEndpoint=(env.ERNEST_CLOUD_SYNC_ENDPOINT||'').trim()||null;
  const cloudAuthorization=(env.ERNEST_CLOUD_SYNC_AUTHORIZATION||'').trim()||null;
  const logUploadEnabled=env.ERNEST_BOAT_LOG_UPLOAD_ENABLED==='true';
  return {
    port:Number(env.ERNEST_OFFLINE_PORT||3210),
    host:env.ERNEST_OFFLINE_HOST||'0.0.0.0',
    ollamaBase:env.OLLAMA_BASE_URL||'http://127.0.0.1:11434',
    cloud:{endpoint:cloudEndpoint,authorization:cloudAuthorization,snapshotEnabled:Boolean(cloudEndpoint),logUploadEnabled:Boolean(cloudEndpoint&&cloudAuthorization&&logUploadEnabled)},
    model:{mode:'auto',preferred:'local',cloudFallbackEnabled:false},
  };
}
