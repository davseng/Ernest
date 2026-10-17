/** Provider-independent retrieval primitives, usable by the onboard runtime. */
const STOP = new Set("about and are can could document does for from have how into me should that the their there these this those what when where which with would know one boat far better please tell is my our your do did be been am was were of to on at in by has had will you we us as an if any".split(" "));
export function retrievalTerms(question: string) {
  const terms = question.normalize("NFKC").toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) ?? [];
  return [...new Set(terms.filter(t => t.length >= 2 && !STOP.has(t)))].slice(0, 20);
}
const ALIASES: Record<string, string[]> = {
  fuel: ["diesel", "gasoline"], water: ["freshwater", "potable"],
  seacock: ["through-hull", "thru-hull"], compartment: ["stowage", "storage", "locker"],
  schematic: ["wiring", "circuit", "diagram"], anchor: ["anchoring"],
  ais: ["automatic identification", "ais700"], predeparture: ["departure", "pre-departure"],
};
export function expandedTerms(question: string) {
  const terms = retrievalTerms(question);
  return [...new Set(terms.flatMap(t => [t, ...(ALIASES[t] ?? [])]))].slice(0, 40);
}
export function evidenceContains(text:string,term:string){
  const normalized=text.toLowerCase();
  return /[0-9]/.test(term) ? new Set<string>(normalized.match(/[a-z0-9][a-z0-9_-]*/g)??[]).has(term) : normalized.includes(term);
}
export type RankedPage = { documentId: string; documentTitle: string; pageNumber: number; text: string; relevance: number };
export function selectEvidence<T extends RankedPage>(question: string, pages: T[], maxChars = 14000, maxPages = 6): T[] {
  const terms = retrievalTerms(question);
  const ranked = pages.map(page => {
    const title = page.documentTitle.toLowerCase(), text = page.text.toLowerCase();
    const coverage = terms.filter(t => evidenceContains(text,t) || evidenceContains(title,t)).length / Math.max(1, terms.length);
    const exactTitle = terms.filter(t => evidenceContains(title,t)).length;
    return { page, score: page.relevance + coverage * 3 + exactTitle * 2 };
  }).sort((a,b) => b.score - a.score || a.page.pageNumber - b.page.pageNumber);
  const minScore=Math.max(0.01,(ranked[0]?.score??0)*0.2);
  const result: T[] = [], seen = new Set<string>(), perDocument = new Map<string, number>();
  let chars = 0;
  for (const {page,score} of ranked) {
    if(score<minScore)continue;
    const key = `${page.documentId}:${page.pageNumber}`;
    if (!page.text.trim() || seen.has(key) || (perDocument.get(page.documentId) ?? 0) >= 3) continue;
    if (result.length >= maxPages) break;
    const remaining = maxChars - chars;
    if (remaining < 300) break;
    const text = page.text.slice(0, remaining);
    result.push({...page, text}); chars += text.length; seen.add(key);
    perDocument.set(page.documentId, (perDocument.get(page.documentId) ?? 0) + 1);
  }
  return result;
}
