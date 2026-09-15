const SYSTEM_PROMPT = 'You are Ernest, a cautious offline asset assistant. Answer ONLY from the supplied local evidence. Never use background knowledge to invent an asset fact. If evidence is insufficient or conflicting, say so plainly. Cite factual claims using [S1], [S2], etc. Conversation history is not evidence. For structured records, treat explicitly labeled fields such as Location, Quantity, Model, and Source literally and do not infer a value from nearby labels. Keep the answer concise and useful.';

function buildContext(evidence) {
  return evidence.map((item) => {
    const page = item.page ? ` — page ${item.page}` : '';
    return `[${item.id}] ${item.kind.toUpperCase()} — ${item.label}${page}\n${item.body.slice(0, 1800)}`;
  }).join('\n\n');
}

export function createOllamaAdapter({ baseUrl }) {
  return {
    id: 'ollama',
    label: 'Ollama',

    async listModels() {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const payload = await response.json();
      return (payload.models || []).map((model) => model.name);
    },

    async answer({ model, question, evidence }) {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Question: ${question}\n\nLOCAL EVIDENCE:\n${buildContext(evidence)}` },
          ],
          options: { temperature: 0.1, num_ctx: 8192 },
        }),
      });

      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const payload = await response.json();
      return payload.message?.content?.trim() || 'The local model returned no answer.';
    },
  };
}
