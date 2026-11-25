// `/` menu ranking for the side-chat rows. DSH 0.2.2 exported `rankByName`
// from `@deepseek-ai/dsh-client-ui-primitives`; 0.2.3 removed it and ranks host
// rows with a bundled search index that is not a shared module. This is the
// 0.2.2 algorithm unchanged, so the rows keep matching as they did.

interface Ranked<T> {
  readonly item: T;
  readonly index: number;
  readonly prefix: boolean;
  readonly score: number;
}

/** Extra weight for name starts and `-` / `_` boundaries. */
function boundaryBonus(name: string, index: number): number {
  return index === 0 || name.charAt(index - 1) === '-' || name.charAt(index - 1) === '_' ? 8 : 0;
}

/**
 * Strongest ordered-subsequence alignment in O(name × query): boundary and
 * adjacent matches earn weight, skipped and leading characters cost it.
 * Undefined when the query is not a subsequence of the name.
 */
function alignmentScore(name: string, query: string): number | undefined {
  if (query.length > name.length) return undefined;
  const noMatch = Number.NEGATIVE_INFINITY;
  let previous = Array<number>(name.length).fill(noMatch);
  for (let index = 0; index < name.length; index++) {
    if (name.charAt(index) === query.charAt(0)) previous[index] = 1 + boundaryBonus(name, index) - index;
  }
  for (let queryIndex = 1; queryIndex < query.length; queryIndex++) {
    const current = Array<number>(name.length).fill(noMatch);
    // `left` is the previous row one character back (adjacent continuation),
    // `leftLeft` two back (the earliest gapped one).
    let left = noMatch;
    let leftLeft = noMatch;
    let bestGapped = noMatch;
    for (const [index, prior] of previous.entries()) {
      if (leftLeft !== noMatch) bestGapped = Math.max(bestGapped, leftLeft + index - 2);
      if (name.charAt(index) === query.charAt(queryIndex)) {
        const bonus = 1 + boundaryBonus(name, index);
        let score = noMatch;
        if (left !== noMatch) score = left + bonus + 4;
        if (bestGapped !== noMatch) score = Math.max(score, bestGapped + bonus + 1 - index);
        current[index] = score;
      }
      leftLeft = left;
      left = prior;
    }
    previous = current;
  }
  let best = noMatch;
  for (const score of previous) best = Math.max(best, score);
  return best === noMatch ? undefined : best;
}

/**
 * Rank named items by a menu query, matching the name or the optional label
 * case-insensitively as an ordered subsequence.
 * @returns prefix hits first, then by alignment score, then in source order;
 *   the input list itself for an empty query.
 */
export function rankByName<T extends { readonly name: string; readonly label?: string }>(
  items: readonly T[],
  rawQuery: string,
): readonly T[] {
  const query = rawQuery.toLowerCase();
  if (query === '') return items;
  const ranked: Ranked<T>[] = [];
  items.forEach((item, index) => {
    const keys = item.label === undefined ? [item.name] : [item.name, item.label];
    let prefix = false;
    let score: number | undefined;
    for (const key of keys) {
      const lower = key.toLowerCase();
      const keyScore = alignmentScore(lower, query);
      if (keyScore === undefined) continue;
      prefix ||= lower.startsWith(query);
      score = score === undefined ? keyScore : Math.max(score, keyScore);
    }
    if (score !== undefined) ranked.push({ item, index, prefix, score });
  });
  ranked.sort((left, right) =>
    Number(right.prefix) - Number(left.prefix) || right.score - left.score || left.index - right.index);
  return ranked.map(match => match.item);
}
