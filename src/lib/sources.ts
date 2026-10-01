/**
 * Source (journal) grouping — the single implementation used by both the
 * category page and the daily briefing page.
 *
 * Why this lives here and not in content.ts: content.ts imports
 * `astro:content`, which plain Node cannot resolve, so anything in it is
 * unreachable from scripts/contract-tests.mjs. Every rule below (label
 * fallback, ordering, tie-breaking, degradation) is a contract-level
 * behaviour that must be pinnable by `npm test`, so it belongs in a
 * Node-safe module alongside urls.ts / identity.ts / format.ts.
 *
 * Identity note: grouping reads `source.name` only. `source.display_name` is
 * a presentation string — it never participates in identity, URLs or GUIDs.
 */

/** Structural subset of an Item entry; ItemEntry satisfies it without imports. */
export interface SourcedItem {
  data: {
    source: {
      name: string;
      /** `| undefined` is explicit so the shape also holds under
       *  `exactOptionalPropertyTypes`, which a future tsconfig may enable. */
      display_name?: string | null | undefined;
    };
  };
}

export interface SourceGroup<T extends SourcedItem = SourcedItem> {
  /** Grouping key: `source.name`, stable across display-name changes. */
  key: string;
  /** Presentation label: `display_name` when present, else `source.name`. */
  label: string;
  /** Members, in input order — the helpers never reorder within a group. */
  items: T[];
}

/**
 * Explicit locale on purpose. A bare `localeCompare()` follows the host
 * locale, so a zh_CN developer machine and an en CI runner would emit
 * different HTML orderings — the same class of machine-dependence that
 * format.ts avoids by formatting in UTC only.
 *
 * With 'en', CJK labels sort AFTER Latin ones, which is what "alphabetical"
 * is normally taken to mean here. ('zh' would collate them first, by pinyin.)
 */
const LABEL_COLLATOR = new Intl.Collator('en', { sensitivity: 'base' });

/** Resolve the label for a source, falling back to the raw `name`. */
export function sourceDisplayName(source: SourcedItem['data']['source']): string {
  return source.display_name ?? source.name;
}

/**
 * Group items by source, sorted alphabetically by label.
 *
 * Degradation is deliberate in both directions:
 *   - a missing/null `display_name` falls back to the raw `name`, un-prettified
 *     (turning `journal_hydrology` into "Journal Hydrology" would invent a
 *     string that is neither the stored key nor the real journal title);
 *   - a single-source result is returned as one group, and callers render it
 *     flat rather than showing a shell for a lone group.
 */
export function groupItemsBySource<T extends SourcedItem>(
  items: readonly T[],
): SourceGroup<T>[] {
  const groups = new Map<string, SourceGroup<T>>();

  for (const item of items) {
    const { name } = item.data.source;
    let group = groups.get(name);
    if (!group) {
      group = { key: name, label: sourceDisplayName(item.data.source), items: [] };
      groups.set(name, group);
    }
    group.items.push(item);
  }

  return [...groups.values()].sort(
    (a, b) =>
      LABEL_COLLATOR.compare(a.label, b.label) ||
      // sensitivity:'base' makes labels differing only in case/accent compare
      // equal, so fall back to the key to keep the order total and independent
      // of Map insertion order.
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/**
 * Which group should start expanded: the largest one, ties broken by
 * alphabetical order.
 *
 * Precondition: `groups` must be the sorted output of groupItemsBySource.
 * Strict `>` (not `>=`) keeps the FIRST maximum, and "first" only means
 * "alphabetically earlier" for a sorted array — the signature cannot express
 * that, so it is stated here.
 */
export function defaultOpenSourceKey<T extends SourcedItem>(
  groups: readonly SourceGroup<T>[],
): string | undefined {
  if (groups.length < 2) return undefined;
  return groups.reduce((best, group) => (group.items.length > best.items.length ? group : best)).key;
}
