const ROUTES = new Set(['auto', 'local', 'cloud']);

export function createModelRouter({ localAdapter, cloudAdapter = null, allowCloudFallback = false }) {
  function status() {
    return {
      mode: 'auto',
      preferred: 'local',
      local: { available: Boolean(localAdapter), adapter: localAdapter?.id || null },
      cloud: { available: Boolean(cloudAdapter), adapter: cloudAdapter?.id || null },
      cloudFallbackEnabled: Boolean(cloudAdapter && allowCloudFallback),
      policy: 'local-first',
    };
  }

  async function listModels() {
    const models = localAdapter ? await localAdapter.listModels() : [];
    return { route: 'local', adapter: localAdapter?.id || null, models };
  }

  async function run(adapter, route, args) {
    if (!adapter) throw new Error(`${route === 'cloud' ? 'Cloud' : 'Local'} model adapter is not configured.`);
    const answer = await adapter.answer(args);
    return { answer, route, adapter: adapter.id };
  }

  async function answer({ model, question, evidence, route = 'auto' }) {
    if (!ROUTES.has(route)) throw new Error(`Unsupported model route: ${route}.`);
    const args = { model, question, evidence };
    if (route === 'local') return run(localAdapter, 'local', args);
    if (route === 'cloud') return run(cloudAdapter, 'cloud', args);
    if (localAdapter) {
      try { return await run(localAdapter, 'local', args); }
      catch (error) {
        if (!cloudAdapter || !allowCloudFallback) throw error;
        return run(cloudAdapter, 'cloud', args);
      }
    }
    if (cloudAdapter && allowCloudFallback) return run(cloudAdapter, 'cloud', args);
    throw new Error('No permitted model route is available.');
  }

  return { id: 'local-first-router', status, listModels, answer };
}
