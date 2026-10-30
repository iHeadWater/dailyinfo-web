import { CATEGORY_BY_ID } from './categories.ts';
import type { CategoryId } from './categories.ts';

/**
 * Logical route builders (layer 1) — pure publication routes, NEVER include
 * the deployment base.
 *
 * Item routes depend on the stable item id — never on the title, never on
 * the markdown filename. Renaming a title therefore cannot change any URL.
 *
 * Deployment mapping happens exclusively in src/lib/site.ts:
 *   withBase(itemRoute(...))    → browser href (e.g. /dailyinfo-web/papers/x/)
 *   absoluteUrl(itemRoute(...)) → canonical public URL
 */

export interface NavLink {
  label: string;
  href: string;
}

export function categoryRoute(id: CategoryId): string {
  return `/${CATEGORY_BY_ID[id].slug}/`;
}

/**
 * Category listing URL for a 1-based page.
 *
 * Page 1 is the category index (`/{slug}/`). Later pages use the reserved
 * path segment `page`, e.g. `/papers/page/2/`. That segment is presentation
 * only — it is not part of Item identity and is never an Item id prefix.
 *
 * @param id Category internal id.
 * @param page 1-based listing page. Values below 1 are treated as page 1.
 */
export function categoryPageRoute(id: CategoryId, page = 1): string {
  if (page <= 1) return categoryRoute(id);
  return `/${CATEGORY_BY_ID[id].slug}/page/${page}/`;
}

export function itemRoute(category: CategoryId, itemId: string): string {
  return `/${CATEGORY_BY_ID[category].slug}/${itemId}/`;
}

export function dailyRoute(date: string): string {
  return `/daily/${date}/`;
}

export function briefingRoute(date: string, category: CategoryId): string {
  return `/daily/${date}/${CATEGORY_BY_ID[category].slug}/`;
}

export function archiveRoute(): string {
  return '/archive/';
}

export function feedRoute(category?: CategoryId): string {
  return category ? `/feed/${CATEGORY_BY_ID[category].slug}.xml` : '/feed.xml';
}
