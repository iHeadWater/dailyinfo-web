import { getCollection, type CollectionEntry } from 'astro:content';
import { CATEGORIES, type CategoryId } from './categories.ts';
import { comparePublishedDesc } from './listing.ts';
import {
  validateParsedCollections,
  formatProblems,
  type LabeledItem,
  type LabeledBriefing,
} from './validate-content.ts';

export type ItemEntry = CollectionEntry<'items'>;
export type BriefingEntry = CollectionEntry<'briefings'>;

export interface SiteContent {
  /** All items, sorted by published_at DESC (id ASC as tiebreaker). */
  items: ItemEntry[];
  /** All briefings, sorted by date DESC then canonical category order. */
  briefings: BriefingEntry[];
  itemsById: Map<string, ItemEntry>;
  briefingsById: Map<string, BriefingEntry>;
  itemsByCategory: Record<CategoryId, ItemEntry[]>;
  /** key: `${date}|${categoryId}` */
  briefingByDateCategory: Map<string, BriefingEntry>;
  /** key: date, value: briefings of that date in canonical category order. */
  briefingsByDate: Map<string, BriefingEntry[]>;
  /** Publication dates (briefing dates ∪ item publish dates), DESC. */
  dates: string[];
  /** Max publication date — the deterministic "today" of the site. */
  latestDate: string;
  /** Max (updated_at ?? published_at) across all publications. */
  lastUpdated: string;
}

/**
 * Load, validate and index the whole publication set.
 *
 * Build-time validation gate: every page and feed builds from the return
 * value of this function. Validation rules live in the shared validator
 * (src/lib/validate-content.ts) — the same core `npm run validate` uses —
 * so the CLI gate and the build gate can never drift. Any violation fails
 * the production build (fail-closed) instead of producing broken links.
 */
async function buildSiteContent(): Promise<SiteContent> {
  const [itemEntries, briefingEntries] = await Promise.all([
    getCollection('items'),
    getCollection('briefings'),
  ]);

  const problems = validateParsedCollections(
    itemEntries.map(
      (entry): LabeledItem => ({
        file: entry.filePath ?? `items/${entry.id}.md`,
        data: entry.data,
      }),
    ),
    briefingEntries.map(
      (entry): LabeledBriefing => ({
        file: entry.filePath ?? `briefings/${entry.id}.md`,
        data: entry.data,
      }),
    ),
  );
  if (problems.length > 0) {
    throw new Error(formatProblems(problems));
  }

  const itemsById = new Map<string, ItemEntry>();
  for (const entry of itemEntries) itemsById.set(entry.data.id, entry);

  const briefingsById = new Map<string, BriefingEntry>();
  for (const entry of briefingEntries) briefingsById.set(entry.data.id, entry);

  // --- indexes ------------------------------------------------------------
  const items = [...itemEntries].sort((a, b) => comparePublishedDesc(a.data, b.data));

  const categoryOrder = new Map(CATEGORIES.map((c, i) => [c.id, i] as const));
  const briefings = [...briefingEntries].sort(
    (a, b) =>
      b.data.date.localeCompare(a.data.date) ||
      (categoryOrder.get(a.data.category) ?? 0) - (categoryOrder.get(b.data.category) ?? 0),
  );

  const itemsByCategory = {} as Record<CategoryId, ItemEntry[]>;
  for (const category of CATEGORIES) itemsByCategory[category.id] = [];
  for (const item of items) itemsByCategory[item.data.category].push(item);

  const briefingByDateCategory = new Map<string, BriefingEntry>();
  const briefingsByDate = new Map<string, BriefingEntry[]>();
  const dateSet = new Set<string>();
  for (const briefing of briefings) {
    briefingByDateCategory.set(`${briefing.data.date}|${briefing.data.category}`, briefing);
    const list = briefingsByDate.get(briefing.data.date) ?? [];
    list.push(briefing);
    briefingsByDate.set(briefing.data.date, list);
    dateSet.add(briefing.data.date);
  }
  for (const item of items) dateSet.add(item.data.published_at.slice(0, 10));

  const dates = [...dateSet].sort((a, b) => b.localeCompare(a));

  let lastUpdated = '';
  for (const entry of [...itemEntries, ...briefingEntries]) {
    const ts = entry.data.updated_at ?? entry.data.published_at;
    if (!lastUpdated || Date.parse(ts) > Date.parse(lastUpdated)) lastUpdated = ts;
  }

  return {
    items,
    briefings,
    itemsById,
    briefingsById,
    itemsByCategory,
    briefingByDateCategory,
    briefingsByDate,
    dates,
    latestDate: dates[0] ?? '',
    lastUpdated,
  };
}

/**
 * Memoized accessor. Memoization is disabled in dev so content edits are
 * picked up without a server restart; production builds cache once.
 */
const shouldMemoize = !(import.meta.env?.DEV ?? false);
let cached: Promise<SiteContent> | null = null;

export function loadSiteContent(): Promise<SiteContent> {
  if (!shouldMemoize) return buildSiteContent();
  if (!cached) {
    cached = buildSiteContent().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

/** All items published on a given date (site.items is already date-sorted DESC). */
export function itemsOnDate(site: SiteContent, date: string): ItemEntry[] {
  return site.items.filter((item) => item.data.published_at.slice(0, 10) === date);
}
