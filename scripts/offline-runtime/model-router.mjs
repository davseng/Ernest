export function createModelRouter({ localAdapter, cloudAdapter = null }) {
  function status() {
    return {
      mode: 'auto',
      preferred: 'local',
      local: { available: Boolean(localAdapter), adapter: localAdapter?.id || null },
      cloud: { available: Boolean(cloudAdapter), adapter: cloudAdapter?.id || null },
      fallbackEnabled: Boolean(cloudAdapter),
    };
  }

  async function listModels() {
    const models = localAdapter ? await localAdapter.listModels() : [];
    return { route: 'local', adapter: localAdapter?.id || null, models };
  }

  async function answer({ model, question, evidence, route = 'auto' }) {
    if (route !== 'auto' && route !== 'local') throw new Error(`Unsupported model route: ${route}.`);
    if (!localAdapter) throw new Error('No local model adapter is configured.');
    const answer = await localAdapter.answer({ model, question, evidence });
    return { answer, route: 'local', adapter: localAdapter.id };
  }

  return { id: 'local-first-router', status, listModels, answer };
}
