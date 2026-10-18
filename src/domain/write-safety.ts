/** Read-only answers must never substitute prose for a mutation workflow. */
export function requestsWrite(message: string) {
  return /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:update|save|remember|record|set|change|correct|add|remove|delete)\b/i.test(message)
    || /(?:^|[.!?]\s+)(?:please\s+)?(?:update|save|remember|record|set|change|correct|add|remove|delete)\b/i.test(message);
}
export function readOnlyAnswer(answer: string) {
  const claimsWrite = /\bI(?:['’]ve|\s+have)?\s+(?:now\s+)?(?:saved|updated|recorded|added|deleted|changed|removed)\b/i.test(answer)
    || /(?:^|\n)\s*(?:[*#✓]+\s*)?(?:updated|saved|recorded|added|deleted|changed|removed)\b/i.test(answer);
  return claimsWrite ? "No change was saved by this reply. Tell me the exact item or fact and the new value so I can offer a real confirmation card." : answer;
}
