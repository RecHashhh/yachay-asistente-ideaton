const questionKey = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Keep useful next questions without repeating a question already asked. */
export function freshSuggestions(candidates: string[], asked: string[], limit = 3): string[] {
  const seen = new Set(asked.map(questionKey));
  const result: string[] = [];
  for (const candidate of candidates) {
    const key = questionKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate.trim());
    if (result.length >= limit) break;
  }
  return result;
}
