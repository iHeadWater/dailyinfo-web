/**
 * Ranking policy — the tunable half of the homepage ranking module.
 *
 * This file is DATA. It contains no comparisons, no branching on category,
 * and no knowledge of how slots are allocated. Everything here is a knob:
 * which sources count as on-topic, which title words count, how prestigious
 * each journal is, and how many slots the topic gets.
 *
 * The split exists so that the two kinds of change never collide:
 *
 *   - "add a journal" / "re-score Nature" / "give the topic 3 slots"
 *        → edit this file only. rank.ts, index.ts and every mechanism test
 *          keep working untouched, because the tests inject their own policy.
 *   - "rank by something other than slots" (a learned score, a bandit, ...)
 *        → rewrite rank.ts only. This file and index.ts keep their shape.
 *
 * Values below are calibrated against the real corpus, not guessed — see the
 * per-field notes. Source names are the backend's `source.name` slugs, which
 * this repo does not own: the registry lives in the DailyInfo publisher. Match
 * what the content actually carries, which is not always the obvious spelling
 * (`shuili_xuebao`, with the underscore).
 */

/** Everything the ranking mechanism can be told. */
export interface RankingPolicy {
  /**
   * Sources whose Items count as on-topic. A hit is worth 2 points.
   *
   * This is the only lever that widens the topic gate: a relevant paper in a
   * source not listed here scores 1 at most (title only) and therefore cannot
   * take a topic slot, no matter how clearly on-topic its title reads.
   */
  relevantSources: ReadonlySet<string>;

  /**
   * Title words that count as on-topic on their own. A hit is worth 1 point.
   *
   * Deliberately a stem-prefix alternation rather than whole words: a trailing
   * boundary would miss every inflection (`hydrology` / `hydrological`).
   *
   * MUST NOT carry the `g` or `y` flag. rank.ts calls `.test()` on this object
   * directly, and those flags make it stateful via `lastIndex` — matching would
   * then alternate between Items instead of scoring each one independently.
   * A pinned assertion checks the shipped pattern is not global.
   */
  titlePattern: RegExp;

  /**
   * Score an Item must reach to be eligible for a topic slot.
   *
   * 2 means "the source must match" — a title-only hit scores 1 and cannot
   * claim a topic slot. That keeps the topic slots' promise auditable: they go
   * to papers from on-topic sources, never to whatever a keyword happened to
   * catch. Widening is done by adding to `relevantSources`, not by lowering
   * this to 1.
   */
  relevanceGate: number;

  /** Journal prestige, keyed by `source.name`. Unlisted sources get `defaultPrestige`. */
  prestige: ReadonlyMap<string, number>;

  /** Prestige for a source absent from `prestige`. */
  defaultPrestige: number;

  /** How many leading slots go to on-topic Items before the general ranking resumes. */
  relevantSlots: number;
}

/**
 * The homepage Papers policy.
 *
 * Corpus notes behind the numbers (measured over the real publication set, not
 * assumed): of 286 Papers on one day, 176 are in prestige>=3 journals and only
 * ONE of those is also on-topic — the two dimensions are near-orthogonal, which
 * is why this is a slot allocation and not a weighted sum. See the module
 * README in index.ts.
 */
export const PAPERS_POLICY: RankingPolicy = {
  /**
   * On-topic sources, slug-for-slug as the publisher emits them.
   *
   * `shuili_xuebao` carries an underscore; the un-spaced form is a real string
   * that appears nowhere, so getting it wrong drops the journal silently.
   * `nature_water` is here rather than left to its title, because a hydrology
   * paper in a hydrology journal should not depend on the keyword table.
   */
  relevantSources: new Set([
    'journal_hydrology',
    'water_research',
    'shuili_xuebao',
    'wrr',
    'hess',
    'jhm',
    'hydrological_processes',
    'nhess',
    'advances_water_resources',
    'james',
    'nature_water',
  ]),

  /**
   * Title alternation, matched case-insensitively.
   *
   * The leading `\b` is load-bearing, not decoration: a bare /river/ matches
   * `drivers` and `nanodrivers`, which measured as three false positives in
   * the corpus. `precipitat` is preferred over the noun `precipitation` alone
   * because it still catches the verb forms.
   *
   * Words deliberately absent, with the false positive each would buy: `rain`
   * (brain, terrain), `stream` (streaming), `hydro` (hydrogen, hydrogel — a
   * large chemistry class), `snow`, `basin` (sedimentary basins),
   * `downstream` (the ML sense).
   *
   * Chinese stems are absent because every title in the corpus is English
   * regardless of the Item's `language` field. Two accepted false positives
   * remain, both scoring 1 and therefore ineligible for a topic slot:
   * "flooding attacks" in network security, and "drought stress" in maize.
   */
  titlePattern:
    /\b(hydrolog|precipitat|evapotranspirat|rainfall|streamflow|catchment|watershed|runoff|groundwater|drought|flood|river)/i,

  relevanceGate: 2,

  /**
   * Four tiers, highest first:
   *
   *   4  general top-tier        nature, science, pnas, science_advances
   *   3  Nature family + hydrology's own top tier
   *   2  field-significant
   *   1  everything else (default)
   *
   * Tier 3 is where this table earns its place: on-topic papers span twelve
   * journals, so prestige is what orders them *within* the topic slots.
   */
  prestige: new Map<string, number>([
    // 4 — general top-tier
    ['nature', 4],
    ['science', 4],
    ['pnas', 4],
    ['science_advances', 4],

    // 3 — Nature family, plus hydrology's own top tier
    ['nature_water', 3],
    ['nature_communications', 3],
    ['nature_sustainability', 3],
    ['nature_geoscience', 3],
    ['nature_machine_intelligence', 3],
    ['nature_reviews_earth_environ', 3],
    ['water_research', 3],
    ['journal_hydrology', 3],
    ['wrr', 3],
    ['hess', 3],

    // 2 — field-significant
    ['jhm', 2],
    ['hydrological_processes', 2],
    ['james', 2],
    ['advances_water_resources', 2],
    ['shuili_xuebao', 2],
    ['nhess', 2],
    ['gmd', 2],
    ['essd', 2],
    ['scientific_data', 2],
    ['environ_modelling_software', 2],
  ]),

  defaultPrestige: 1,

  /** Homepage Papers renders 3 cards; the first two are the topic's. */
  relevantSlots: 2,
};
