/**
 * Homepage ranking — the module's only public entry point.
 *
 * Pages import from HERE and nowhere else inside this directory. That is what
 * lets the internals move: `rank.ts` can be rewritten, `policy.ts` retuned, and
 * a caller that only ever wrote `rankForCategory(...)` never notices.
 *
 * ── Why the homepage ranks at all ──────────────────────────────────────────
 *
 * Lists elsewhere on the site are chronological, and stay that way. The
 * homepage is the one surface that has to choose, because "今日内容" shows only
 * three Papers out of the day's ~286.
 *
 * The underlying sort is a date sort, but `published_at` is a BATCH INGEST
 * timestamp: every Item from one publisher run shares it to the microsecond.
 * Measured over a real 899-Item day, 841 of them sat in single-timestamp
 * groups, so `published_at DESC` compared equal all the way down and the order
 * collapsed onto its tiebreaker — `id` — which for Papers is
 * `{journal-slug}-{hash}`. The visible result was alphabetical by journal
 * (`advances_water_resources` < `aies` < `bams`), surfacing one on-topic paper
 * in three.
 *
 * ── Why slots, not a weighted sum ─────────────────────────────────────────
 *
 * The obvious fix — score journals for prestige, score topics for relevance,
 * add them up — does not work on this corpus. Of 286 Papers in a day, 176 were
 * in prestige>=3 journals and only ONE of those was also on-topic: the two
 * dimensions are near-orthogonal, so a weighted sum has no balance region, only
 * a crossover. Measured, the crossover sits between weight 1 and 1.5: below it
 * the homepage is all hydrology, above it all Nature/Science/PNAS — and above
 * it, plausibly about cocoa yields, tumours and polymer chemistry.
 *
 * So the homepage expresses "both" with POSITIONS rather than weights: the
 * leading `relevantSlots` cards are the topic's, ranked by prestige among
 * themselves; the remaining cards come from the general prestige ranking. The
 * two dimensions stop competing for one number.
 *
 * ── Upgrading ─────────────────────────────────────────────────────────────
 *
 *   add / re-score a journal, widen the keyword table, change the slot count
 *       → policy.ts
 *   change how ranking works (a learned score, a bandit, source diversity)
 *       → rank.ts, keeping the two signatures below
 *   rank a second category
 *       → POLICY_BY_CATEGORY below, plus a policy in policy.ts
 */

import type { CategoryId } from '../categories.ts';
import { PAPERS_POLICY, type RankingPolicy } from './policy.ts';
import { allocateSlots, type ScorableItem } from './rank.ts';

export type { RankingPolicy, ScorableItem };
export { allocateSlots, computePrestige, computeRelevance } from './rank.ts';
export { PAPERS_POLICY } from './policy.ts';

/**
 * Which category is ranked, and by what policy.
 *
 * A category absent from this map is returned untouched — the chronological
 * order every other page on the site uses. That is the deliberate default:
 * ranking is a homepage-specific editorial decision, not a site-wide one.
 */
const POLICY_BY_CATEGORY: ReadonlyMap<CategoryId, RankingPolicy> = new Map([
  ['papers', PAPERS_POLICY],
]);

/**
 * Rank one category's Items for the homepage.
 *
 * Always returns a NEW array, and never mutates or reorders the input. The
 * caller keeps `.slice(0, N)` — ranking the full list here is what makes the
 * policy testable without rendering a page.
 */
export function rankForCategory<T extends ScorableItem>(
  category: CategoryId,
  items: readonly T[],
): T[] {
  const policy = POLICY_BY_CATEGORY.get(category);
  if (!policy) return [...items];
  return allocateSlots(items, policy);
}
