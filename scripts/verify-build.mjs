#!/usr/bin/env node
/**
 * Production artifact checks for the GitHub Pages project-site deployment.
 *
 * This deliberately inspects generated files rather than source templates:
 * Astro can type-check and build successfully while a hand-written URL still
 * points at the host root. Run after `astro build` (the npm build script does
 * this automatically).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { SITE, absoluteUrl, withBase } from '../src/lib/site.ts';
import { briefingRoute, dailyRoute, itemRoute } from '../src/lib/urls.ts';
import { CATEGORIES } from '../src/lib/categories.ts';
import { findRenderedItem } from './verify-build-helpers.mjs';

const repo = new URL('..', import.meta.url).pathname;
const dist = join(repo, 'dist');
let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(relativePath) {
  try {
    return readFileSync(join(dist, relativePath), 'utf8');
  } catch {
    return '';
  }
}

function collectFiles(directory, suffix) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolute, suffix);
    return entry.name.endsWith(suffix) ? [absolute] : [];
  });
}

function readFrontmatter(file) {
  const source = readFileSync(file, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return parseYaml(match[1]);
}

function collectContentData(directory) {
  return collectFiles(directory, '.md')
    .map((file) => {
      try {
        return readFrontmatter(file);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const contentItems = collectContentData(join(repo, 'src/content/items'));
const contentBriefings = collectContentData(join(repo, 'src/content/briefings'));
const home = read('index.html');
const { item: sampleItem, href: itemHref } = findRenderedItem(
  contentItems,
  home,
  (contentItem) => withBase(itemRoute(contentItem.category, contentItem.id)),
);
const sampleBriefing =
  contentBriefings.find(
    (briefing) => sampleItem?.briefing_ids?.includes(briefing.id),
  ) ?? contentBriefings[0];
const sampleDate = sampleBriefing?.date ?? '';
const sampleCategory = sampleBriefing?.category ?? 'papers';
const sampleItemRoute = sampleItem
  ? itemRoute(sampleItem.category, sampleItem.id)
  : '';
const sampleBriefingRoute = sampleBriefing
  ? briefingRoute(sampleDate, sampleCategory)
  : '';
const sampleDailyRoute = sampleBriefing ? dailyRoute(sampleDate) : '';

const papers = read('papers/index.html');
const daily = sampleBriefing ? read(`${sampleDailyRoute.slice(1)}index.html`) : '';
const briefing = sampleBriefing ? read(`${sampleBriefingRoute.slice(1)}index.html`) : '';
const item = sampleItem ? read(`${sampleItemRoute.slice(1)}index.html`) : '';
const productionRoot = withBase('/');
const dailyHref = sampleBriefing ? withBase(sampleDailyRoute) : '';
const briefingHref = sampleBriefing ? withBase(sampleBriefingRoute) : '';
const itemUrl = sampleItem ? absoluteUrl(sampleItemRoute) : '';

console.log(`\n[1] Generated HTML (${SITE.publicUrl})`);
check('dist/index.html exists', home.length > 0);
check('dist/favicon.svg exists', existsSync(join(dist, 'favicon.svg')));
check('stylesheet uses deployment base', /href="[^"\s]*\/_astro\/[^"\s]+\.css"/.test(home));
const stylesheetHref = home.match(/<link rel="stylesheet" href="([^"]+)">/)?.[1] ?? '';
check(
  'generated stylesheet exists in dist',
  stylesheetHref.startsWith(productionRoot) &&
    existsSync(join(dist, stylesheetHref.slice(productionRoot.length))),
  stylesheetHref,
);
check('favicon href uses deployment base', home.includes(`href="${withBase('/favicon.svg')}"`));
check('Papers navigation stays under deployment base', home.includes(`href="${withBase('/papers/')}"`));
check(
  'Daily href stays under deployment base',
  !sampleBriefing || home.includes(`href="${dailyHref}"`),
);
check(
  'Briefing href stays under deployment base',
  !sampleBriefing || home.includes(`href="${briefingHref}"`),
);
check(
  'Item href stays under deployment base',
  !sampleItem || home.includes(`href="${itemHref}"`),
);
check('global RSS href uses deployment base', home.includes(`href="${withBase('/feed.xml')}"`));

const htmlFiles = collectFiles(dist, '.html');
const internalUrls = htmlFiles.flatMap((file) => {
  const html = readFileSync(file, 'utf8');
  return [...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)].map((match) => match[1]);
});
const badInternalUrls = internalUrls.filter((url) => !url.startsWith(productionRoot));
check(
  'all root-relative HTML href/src values stay under deployment base',
  badInternalUrls.length === 0,
  badInternalUrls.slice(0, 5).join(', '),
);

console.log('\n[2] SEO and representative routes');
check('Papers route artifact exists', papers.length > 0);
if (sampleItem && sampleBriefing) {
  check(
    'Item canonical URL uses current public URL',
    item.includes(`<link rel="canonical" href="${itemUrl}">`),
  );
  check('Item og:url uses current public URL', item.includes(`<meta property="og:url" content="${itemUrl}">`));
  check('Daily route artifact exists', daily.length > 0);
  check('Briefing route artifact exists', briefing.length > 0);
  check('Item route artifact exists', item.length > 0);
  check('Daily page links to its briefing', daily.includes(`href="${briefingHref}"`));
  check('Briefing page links to its Daily page', briefing.includes(`href="${dailyHref}"`));
  check('Briefing page links to its Item', briefing.includes(`href="${itemHref}"`));
  check('Item page links to its Briefing', item.includes(`href="${briefingHref}"`));
} else if (sampleItem) {
  check(
    'Item canonical URL uses current public URL',
    item.includes(`<link rel="canonical" href="${itemUrl}">`),
  );
  check('Item og:url uses current public URL', item.includes(`<meta property="og:url" content="${itemUrl}">`));
  check('Item route artifact exists', item.length > 0);
} else {
  check(
    'empty production content is a valid pre-first-publication state',
    contentItems.length === 0 && contentBriefings.length === 0,
  );
}

console.log('\n[3] RSS, robots and sitemap');
const feed = read('feed.xml');
const papersFeed = read('feed/papers.xml');
check('global feed artifact exists', feed.length > 0);
check('papers feed artifact exists', papersFeed.length > 0);
check('global feed site link uses current public URL', feed.includes(`<link>${SITE.publicUrl}</link>`));
if (sampleItem) {
  check('RSS item link uses current public URL', feed.includes(`<link>${itemUrl}</link>`));
  check(
    'RSS GUID equals canonical Item URL',
    feed.includes(`<guid isPermaLink="true">${itemUrl}</guid>`,
    ),
  );
}
const robots = read('robots.txt');
check('robots sitemap uses current public URL', robots.includes(`Sitemap: ${absoluteUrl('/sitemap-index.xml')}`));
const sitemapIndex = read('sitemap-index.xml');
check('sitemap index uses current public URL', sitemapIndex.includes(`<loc>${SITE.publicUrl}sitemap-0.xml</loc>`));
const sitemapFiles = [
  join(dist, 'sitemap-index.xml'),
  ...collectFiles(dist, '.xml').filter((file) => /sitemap-\d+\.xml$/.test(file)),
];
const sitemapUrls = sitemapFiles.flatMap((file) => {
  const xml = readFileSync(file, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
});
check(
  'all sitemap URLs use current public URL',
  sitemapUrls.length > 0 && sitemapUrls.every((url) => url.startsWith(SITE.publicUrl)),
  sitemapUrls.find((url) => !url.startsWith(SITE.publicUrl)),
);
if (sampleItem) {
  check('sitemap contains representative Item URL', sitemapUrls.includes(itemUrl));
}

console.log('\n[4] Source (journal) grouping in category pages');
// Conditional by necessity: a category with a single source must stay flat, and
// an empty category is a valid state. The count of rendered group shells is
// derived from the content on disk, not hardcoded.
const sourcesByCategory = new Map();
for (const contentItem of contentItems) {
  if (!contentItem.source?.name) continue;
  const bucket = sourcesByCategory.get(contentItem.category) ?? new Set();
  bucket.add(contentItem.source.name);
  sourcesByCategory.set(contentItem.category, bucket);
}

for (const category of CATEGORIES) {
  const sourceCount = (sourcesByCategory.get(category.id) ?? new Set()).size;
  if (sourceCount === 0) continue;

  // read() swallows file errors and returns '', so a missing artifact must be a
  // failure here — otherwise a dist layout change would silently turn every
  // assertion below into a no-op that still reports "passed".
  const categoryHtml = read(`${category.slug}/index.html`);
  check(`${category.slug}: category page artifact exists`, categoryHtml.length > 0);
  if (categoryHtml.length === 0) continue;

  const batches = [
    ...categoryHtml.matchAll(/<details class="item-batch item-batch--source"[^>]*>/g),
  ].map((match) => match[0]);
  const expanded = batches.filter((tag) => / open(=|>|\s|$)/.test(tag));

  if (sourceCount > 1) {
    check(
      `${category.slug}: renders one group per source`,
      batches.length === sourceCount,
      `${batches.length} group(s) for ${sourceCount} source(s)`,
    );
    check(
      `${category.slug}: exactly one group starts expanded`,
      expanded.length === 1,
      `${expanded.length} expanded`,
    );
  } else {
    check(
      `${category.slug}: single-source category stays a flat list`,
      batches.length === 0,
      `${batches.length} group(s)`,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
