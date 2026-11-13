/**
 * Publication-surface windowing — RSS feed length and category-list
 * pagination. These rules decide which Items appear on a given listing or
 * feed; they never change Item identity, canonical URLs, or RSS GUIDs.
 *
 * Defaults are overridable at build time:
 *   FEED_ITEM_LIMIT       most-recent Items per RSS feed (default 50)
 *   CATEGORY_PAGE_SIZE    Items per category listing page (default 50)
 *   FEED_MAX_BYTES        fail-closed RSS artifact size cap (default 200 KiB)
 *   CATEGORY_INDEX_MAX_BYTES  fail-closed first-page HTML cap (default 200 KiB)
 */

/**
 * Parse a strictly positive integer from an env var.
 *
 * @param name Environment variable name.
 * @param fallback Value used when the variable is unset or empty.
 * @returns The parsed integer.
 */
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

/** Most-recent Items included in each RSS feed (global and per-category). */
export const FEED_ITEM_LIMIT = readPositiveInt('FEED_ITEM_LIMIT', 50);

/** Items rendered on one category listing page. */
export const CATEGORY_PAGE_SIZE = readPositiveInt('CATEGORY_PAGE_SIZE', 50);

/** Fail-closed RSS file-size cap used by `scripts/verify-build.mjs`. */
export const FEED_MAX_BYTES = readPositiveInt('FEED_MAX_BYTES', 200 * 1024);

/**
 * Fail-closed HTML size cap for a category listing page (issue #2: first
 * screen of `/papers/` must stay at or under 200 KB).
 */
export const CATEGORY_INDEX_MAX_BYTES = readPositiveInt(
  'CATEGORY_INDEX_MAX_BYTES',
  200 * 1024,
);

/**
 * Newest-first ordering shared by feeds, category listings and the site
 * index. Tie-break on `id` so two Items published at the same instant have
 * a total, deterministic order.
 *
 * @param a Left Item identity/timestamp fields.
 * @param b Right Item identity/timestamp fields.
 * @returns Negative when `a` should appear before `b`.
 */
export function comparePublishedDesc(
  a: { published_at: string; id: string },
  b: { published_at: string; id: string },
): number {
  return Date.parse(b.published_at) - Date.parse(a.published_at) || a.id.localeCompare(b.id);
}

/**
 * Keep the first `limit` entries of an already newest-first list.
 *
 * @param items Newest-first collection (not copied except for the slice).
 * @param limit Maximum number of entries to keep.
 * @returns A new array of at most `limit` entries; input is not mutated.
 */
export function takeRecentItems<T>(items: readonly T[], limit: number): T[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`takeRecentItems() limit must be a positive integer, got ${limit}`);
  }
  return items.slice(0, limit);
}

export interface PageWindow<T> {
  /** 1-based page number. */
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  items: T[];
  /** 1-based index of the first item on this page, or 0 when empty. */
  startIndex: number;
  /** 1-based index of the last item on this page, or 0 when empty. */
  endIndex: number;
}

/**
 * Number of listing pages needed for `totalItems` at `pageSize`.
 *
 * An empty collection still occupies page 1 (the category index), so the
 * result is never 0.
 *
 * @param totalItems Collection size.
 * @param pageSize Items per page.
 * @returns Page count, at least 1.
 */
export function totalPages(totalItems: number, pageSize: number): number {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`pageSize must be a positive integer, got ${pageSize}`);
  }
  if (totalItems <= 0) return 1;
  return Math.ceil(totalItems / pageSize);
}

/**
 * Slice `items` into the window for a 1-based `page`.
 *
 * @param items Newest-first collection.
 * @param page 1-based page number.
 * @param pageSize Items per page.
 * @returns The page window. Throws when `page` is out of range.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageWindow<T> {
  const pages = totalPages(items.length, pageSize);
  if (!Number.isInteger(page) || page < 1 || page > pages) {
    throw new Error(`page ${page} is out of range 1..${pages}`);
  }
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    page,
    pageSize,
    totalItems: items.length,
    totalPages: pages,
    items: slice,
    startIndex: slice.length === 0 ? 0 : start + 1,
    endIndex: start + slice.length,
  };
}

/**
 * 1-based page numbers that get a dedicated `/page/{n}/` route.
 *
 * Page 1 is the category index (`/{slug}/`) and is therefore omitted.
 *
 * @param pages Total page count.
 * @returns Page numbers starting at 2.
 */
export function extraListingPages(pages: number): number[] {
  const result: number[] = [];
  for (let page = 2; page <= pages; page += 1) result.push(page);
  return result;
}

/**
 * Compact page-number sequence for a pager control.
 *
 * Always includes 1, `current`, and `total`. Interior gaps become the
 * sentinel `'ellipsis'`. `siblings` extra numbers on each side of `current`
 * keep a 40-page listing short.
 *
 * @param current 1-based current page.
 * @param total Total page count.
 * @param siblings How many numbers to keep on each side of `current`.
 * @returns Numbers and optional `'ellipsis'` sentinels, in order.
 */
export function paginationSequence(
  current: number,
  total: number,
  siblings = 1,
): Array<number | 'ellipsis'> {
  if (!Number.isInteger(total) || total < 1) return [];
  if (total === 1) return [1];
  const pages = new Set<number>([1, total]);
  for (let page = current - siblings; page <= current + siblings; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const sequence: Array<number | 'ellipsis'> = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index]!;
    if (index > 0 && page - sorted[index - 1]! > 1) sequence.push('ellipsis');
    sequence.push(page);
  }
  return sequence;
}
