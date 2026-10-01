/**
 * Ranking mechanism — the algorithmic half of the homepage ranking module.
 *
 * This file is MECHANISM. No journal name, no score, no category string and no
 * slot count appears below: every one of those arrives through the injected
 * `RankingPolicy`. Swap policy.ts to retune, rewrite this file to change how
 * ranking works at all.
 *
 * Why this lives outside content.ts: content.ts imports `astro:content`, which
 * plain Node cannot resolve, so anything in it is unreachable from
 * scripts/contract-tests.mjs. This ranking is contract-level behaviour that has
 * to be pinnable by `npm test`, so it belongs in a Node-safe module — same
 * reasoning as sources.ts, and the same constraint: nothing here may import
 * `astro:*`, and only `import type` may be used, so the module has no runtime
 * imports at all.
 */

import type { RankingPolicy } from './policy.ts';

/**
 * Structural subset of an Item entry; ItemEntry satisfies it without imports.
 *
 * `| undefined` is explicit on `source_published_at` so the shape also holds
 * under `exactOptionalPropertyTypes`, which a future tsconfig may enable —
 * the same spelling sources.ts uses for the same reason.
 */
export interface ScorableItem {
  id: string;
  data: {
    title: string;
    published_at: string;
    source_published_at?: string | null | undefined;
    source: { name: string };
  };
}

/** Points for a source-table hit. */
const SOURCE_HIT = 2;

/** Points for a title-pattern hit. */
const TITLE_HIT = 1;

/**
 * How on-topic an Item is, 0-3: the two signals ADD rather than take the max,
 * so "on-topic journal AND on-topic title" outranks either alone.
 *
 * Read together with `policy.relevanceGate`, which is what decides whether this
 * number earns a topic slot. A policy that gates at 2 makes the source table the
 * entry requirement and lets the title only break ties among qualifying items.
 *
 * Category-agnostic on purpose — "which categories are ranked at all" is a
 * wiring question, answered in index.ts, not a scoring question.
 */
export function computeRelevance(item: ScorableItem, policy: RankingPolicy): number {
  return (
    (policy.relevantSources.has(item.data.source.name) ? SOURCE_HIT : 0) +
    // `.test` on a non-global regex is stateless. A `/g` policy pattern would
    // carry lastIndex between calls and make this silently every-other-item;
    // policy.ts documents the constraint where the pattern is declared.
    (policy.titlePattern.test(item.data.title) ? TITLE_HIT : 0)
  );
}

/**
 * Journal standing, highest wins. Unlisted sources get `policy.defaultPrestige`
 * rather than 0, so the fallback slot ranks by an ordering that is total:
 * everything unlisted ties, and the next key decides.
 */
export function computePrestige(item: ScorableItem, policy: RankingPolicy): number {
  return policy.prestige.get(item.data.source.name) ?? policy.defaultPrestige;
}

/**
 * The instant an Item counts as "new" for ranking purposes.
 *
 * `source_published_at` when the producer supplied one: for Papers that is a
 * real per-article date, which the batch-wide `published_at` is not. The
 * fallback is mandatory rather than cosmetic — `Date.parse(null)` is NaN.
 *
 * The two failure modes deliberately differ, and that asymmetry is a decision:
 * a MISSING date (`null`/absent) falls back to `published_at`, because absent
 * is a legitimate producer state; a PRESENT but unparseable date does not, it
 * is demoted by the guard below. Substituting the batch stamp there would hide
 * a producer defect behind a plausible-looking recent date.
 *
 * NaN is then mapped to the epoch so this is always a finite number, and that
 * guard is load-bearing too. The gates validate a timestamp's SHAPE, not its
 * calendar range (ISO_TIMESTAMP in schemas.ts is a regex over digits and
 * separators), so `2026-13-01T00:00:00Z` and `2026-10-01T25:00:00Z` both reach
 * here and both parse to NaN. A NaN in a comparator does not throw — it drops
 * out of the `||` chain, so the timestamp key silently stops applying to every
 * pair involving that Item while still applying to the others. The comparison
 * stops being transitive and the output starts depending on input order, which
 * is precisely the degradation this module exists to remove.
 *
 * Measured: no such timestamp exists in the current corpus, so this is
 * defensive. Epoch, not -Infinity: two guarded Items must compare EQUAL, and
 * `-Infinity - -Infinity` is NaN, which would reintroduce the same hole.
 */
function contentTime(item: ScorableItem): number {
  const parsed = Date.parse(item.data.source_published_at ?? item.data.published_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Order by UTF-16 code unit — deliberately NOT `localeCompare`.
 *
 * sources.ts documents the same discipline for group labels: a bare
 * localeCompare follows the host locale, so a build machine and a developer
 * machine can emit different orderings. Here it also actually diverges on ids
 * the STABLE_ID charset allows: `'.'` (0x2E) sorts below `'0'` (0x30) and
 * `'_'` (0x5F) above it, so `'x.y' < 'x_y'` by code unit while
 * `'x.y'.localeCompare('x_y')` is 1.
 *
 * This is the last key in both comparators, which is what makes each one a
 * total order and the output independent of input order.
 */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Topic slots: relevance leads, prestige separates equals. */
function byRelevanceThenPrestige(policy: RankingPolicy) {
  return (a: ScorableItem, b: ScorableItem): number =>
    computeRelevance(b, policy) - computeRelevance(a, policy) ||
    computePrestige(b, policy) - computePrestige(a, policy) ||
    contentTime(b) - contentTime(a) ||
    compareCodeUnits(a.id, b.id);
}

/**
 * The general ranking: prestige leads.
 *
 * Relevance is the SECOND key, not absent. Without it, equally prestigious
 * items fall through to the timestamp and the id, and an on-topic paper loses
 * its place to an unrelated one from the same journal — which is exactly how a
 * pnas paper about rainfall extremes gets pushed out by a pnas paper about
 * polymer chemistry.
 */
function byPrestigeThenRelevance(policy: RankingPolicy) {
  return (a: ScorableItem, b: ScorableItem): number =>
    computePrestige(b, policy) - computePrestige(a, policy) ||
    computeRelevance(b, policy) - computeRelevance(a, policy) ||
    contentTime(b) - contentTime(a) ||
    compareCodeUnits(a.id, b.id);
}

/**
 * Rank Items by place rather than by score: the leading `relevantSlots` go to
 * on-topic Items, everything else follows in prestige order.
 *
 * Weighting the two together was measured and rejected — see the module
 * comment in index.ts. Short inputs degrade one slot at a time: fewer on-topic
 * Items than slots simply means the general ranking fills further up, and an
 * empty input returns empty.
 */
export function allocateSlots<T extends ScorableItem>(
  items: readonly T[],
  policy: RankingPolicy,
): T[] {
  const relevant = items
    .filter((item) => computeRelevance(item, policy) >= policy.relevanceGate)
    .sort(byRelevanceThenPrestige(policy));

  // Guarded because slice(0, -1) drops the LAST element instead of erroring —
  // a negative slot count would otherwise be silently wrong rather than loud.
  // `0` is a legitimate setting: it disables topic slots and yields the plain
  // general ranking.
  const slots = Math.max(0, policy.relevantSlots);
  // Keyed on `id`, which the validator makes unique across all Items — so an
  // Item cannot be held back here by a collision. Ids are the contract's
  // identity (publication-v1); do not switch this to a title or an index.
  const taken = new Set(relevant.slice(0, slots).map((item) => item.id));
  const rest = items
    .filter((item) => !taken.has(item.id))
    .sort(byPrestigeThenRelevance(policy));

  return [...relevant.slice(0, slots), ...rest];
}
