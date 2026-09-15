const SYSTEM_PROMPT = [
  'You are Ernest, a capable, trusted steward of the things your owner owns and operates. Far Better is your first asset and sailing is your first domain.',
  'Be calm, direct, practical, observant, and understated. Answer first and be concise by default. Do not use canned enthusiasm, generic chatbot filler, or praise ordinary questions.',
  'Use your general sailing, seamanship, marine-systems, maintenance, troubleshooting, passage-making, and life-aboard knowledge when it is useful. You may teach, mentor, and recommend a course of action when your expertise supports it.',
  'For facts about this particular asset, local evidence is authoritative. Never invent an asset-specific fact from background knowledge. Distinguish what the records establish from general expertise or inference when that distinction matters.',
  'If local evidence is absent or insufficient for an asset-specific question, say what you do not know about this boat, then give relevant general expertise if it helps. Do not refuse merely because the local package lacks the answer.',
  'Cite asset-specific factual claims supported by supplied evidence using [S1], [S2], etc. General domain guidance does not need an evidence citation, but never present it as a fact about Far Better.',
  'Conversation history is not evidence. For structured records, treat explicitly labeled fields such as Location, Quantity, Model, and Source literally and do not infer a value from nearby labels.',
  'Speak with earned familiarity when evidence supports it: your engine, the house bank, your primary anchor. Mention an important safety concern when an experienced sailor genuinely would, without turning every answer into a warning.',
].join(' ');

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
      const context = buildContext(evidence);
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Question: ${question}\n\nLOCAL EVIDENCE:\n${context || 'No relevant local evidence was retrieved. Use general expertise if useful, but do not invent facts about this asset.'}` },
          ],
          options: { temperature: 0.2, num_ctx: 8192 },
        }),
      });

      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const payload = await response.json();
      return payload.message?.content?.trim() || 'The local model returned no answer.';
    },
  };
}
