export function createCloudSnapshotClient({ endpoint, fetchImpl = fetch, authorization = null }) {
  if (!endpoint) throw new Error('Cloud sync endpoint is required.');
  const base = String(endpoint).replace(/\/$/, '');
  async function check({ revision = null } = {}) {
    const url = new URL(base);
    if (revision) url.searchParams.set('revision', revision);
    const headers = { Accept: 'application/json' };
    if (authorization) headers.Authorization = authorization;
    let response;
    try { response = await fetchImpl(url, { method: 'GET', headers, redirect: 'manual' }); }
    catch (error) { return { status: 'offline', error: error.message }; }
    let body = null;
    try { body = await response.json(); } catch {}
    if (response.status === 401) return { status: 'authentication-required', error: body?.error || 'Authentication required.' };
    if (!response.ok) return { status: 'error', httpStatus: response.status, error: body?.error || `Cloud sync failed with HTTP ${response.status}.` };
    if (body?.status === 'current') return { status: 'current', sync: body.sync || null, package: null };
    if (body?.status === 'update' && body.package) return { status: 'update', sync: body.sync || body.package.sync || null, package: body.package };
    return { status: 'error', error: 'Cloud sync returned an unsupported response.' };
  }
  return { check };
}
