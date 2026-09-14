const STOP = new Set('a an and are as at be by can could did do does for from had has have how i in into is it me my of on or our should that the their there these they this those to was we what when where which who why will with would you your'.split(' '));

const text = (value) => value == null ? '' : String(value);

export function tokenize(value) {
  return text(value)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9_-]*/g)
    ?.filter((token) => token.length > 1 && !STOP.has(token)) || [];
}

function scoreRecord(questionTokens, record) {
  let score = 0;
  const label = record.label.toLowerCase();
  const body = record.body.toLowerCase();

  for (const token of questionTokens) {
    if (record.tokenSet.has(token)) score += 3;
    if (label.includes(token)) score += 3;
    if (body.includes(token)) score += 1;
  }

  const phrase = questionTokens.join(' ');
  if (phrase.length > 3 && body.includes(phrase)) score += 8;
  if (record.kind !== 'document') score += 0.5;
  return score;
}

export function retrieve(records, question, limit = 8) {
  const questionTokens = [...new Set(tokenize(question))];
  return records
    .map((record) => ({ record, score: scoreRecord(questionTokens, record) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function toPublicEvidence(hit, index) {
  return {
    id: `S${index + 1}`,
    kind: hit.record.kind,
    label: hit.record.label,
    body: hit.record.body,
    page: hit.record.page || null,
    source: hit.record.source || null,
    score: hit.score,
  };
}
