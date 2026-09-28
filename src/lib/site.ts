/**
 * Canonical site & deployment configuration — the single source of truth for
 * where the site is published.
 *
 * Three URL layers (frozen in docs/contracts/publication-v1.md §6):
 *
 *   1. Logical route      e.g.  /papers/openreview-example-001/
 *      — publication identity; NEVER includes the deployment base.
 *   2. Deployment href    e.g.  /dailyinfo-web/papers/openreview-example-001/
 *      — what the browser requests from the deployed host.
 *   3. Absolute public URL e.g. https://iheadwater.github.io/dailyinfo-web/papers/openreview-example-001/
 *      — canonical URL / RSS GUID / og:url.
 *
 * astro.config.ts imports SITE.origin / SITE.base as the Astro `site`/`base`
 * values; SEO tags, RSS, robots.txt, sitemap and every internal link derive
 * from them via withBase()/absoluteUrl(). Never hardcode the origin or the
 * base path anywhere else.
 *
 * Build-time env overrides (optional):
 *   SITE_ORIGIN  e.g. https://daily.iheadwater.org
 *   SITE_BASE    e.g. /            (root deployment)
 *
 * Current production = GitHub Pages project site:
 *   https://iheadwater.github.io/dailyinfo-web/
 *
 * Future custom-domain migration = change these defaults (or set the env in
 * the deploy workflow) to SITE_ORIGIN=https://daily.iheadwater.org and
 * SITE_BASE=/ — no business route changes, no identity changes.
 */

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

/** '' means root deployment ('/' or '' input); otherwise '/segment' without trailing slash. */
function normalizeBase(base: string): string {
  const trimmed = base.trim().replace(/^\/+/, '/').replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '/') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

const ORIGIN = normalizeOrigin(process.env.SITE_ORIGIN ?? 'https://iheadwater.github.io');
const BASE = normalizeBase(process.env.SITE_BASE ?? '/dailyinfo-web');

export const SITE = {
  /** Deployment host origin — no trailing slash. */
  origin: ORIGIN,
  /** Deployment base path — '' for root, '/dailyinfo-web' for the Pages project site. */
  base: BASE,
  /** Full public site URL (origin + base, trailing slash). */
  publicUrl: `${ORIGIN}${BASE}/`,
  name: 'DailyInfo',
  tagline: 'AI for Science Intelligence',
  description:
    'DailyInfo 是自动生成的 AI for Science 科研情报日报：论文、AI 新闻、代码、资源与 arXiv 条目的摘要、点评与导航。',
  language: 'zh-CN',
  /**
   * Reserved interface for a future og:image (root-relative path).
   * Keep `null` until a real image asset exists — no dynamic image service in v1.
   */
  ogImage: null as string | null,
};

/**
 * Prefix a logical route with the deployment base (layer 2).
 *
 * `withBase('/')` → `/dailyinfo-web/`; `withBase('/papers/')` →
 * `/dailyinfo-web/papers/`; with a root deployment (base '') routes pass
 * through unchanged. Input must be a root-relative path.
 */
export function withBase(route: string): string {
  if (!route.startsWith('/')) {
    throw new Error(`withBase() expects a root-relative route, got ${JSON.stringify(route)}`);
  }
  return `${SITE.base}${route}`;
}

/** Absolute public URL for a logical route (layer 3): origin + base + route. */
export function absoluteUrl(route: string): string {
  return `${SITE.origin}${withBase(route)}`;
}

/** Global source-attribution notice (rendered in the footer). */
export const ATTRIBUTION =
  'DailyInfo 提供自动生成的科研信息摘要，用于科研信息发现和研究导航。文章标题、作者及原始内容版权归原作者及对应来源平台所有，请以原始来源为准。';
