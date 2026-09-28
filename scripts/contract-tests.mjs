#!/usr/bin/env node
/**
 * Contract regression tests — Phase 1A freeze.
 *
 * Deterministic by construction: fixed fixture data, fixed fixture dates,
 * no Date.now(), no network, no system-clock dependence.
 *
 * Sections:
 *   1. Identity / URL / RSS GUID contracts (pure functions)
 *   2. Schema validation (shared zod core, negative cases)
 *   3. Publication integrity (shared validator, negative cases)
 *   4. Direct zod .refine() behavior (astro/zod in plain Node)
 *   5. Astro content-layer probe (tests/refine-probe) — pins the W1-001
 *      root cause: fresh syncs enforce refinements; a stale
 *      node_modules/.astro cache does not re-validate unchanged entries
 *      after the schema is tightened.
 *
 * Run: npm test
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const lib = (name) => import(pathToFileURL(join(repo, 'src/lib', name)));

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

const fixtureValidation = spawnSync(
  process.execPath,
  [join(repo, 'scripts/validate-content.mjs'), '--fixtures'],
  { cwd: repo, encoding: 'utf8' },
);
check(
  'synthetic contract fixtures validate outside production content',
  fixtureValidation.status === 0,
  fixtureValidation.stderr,
);

// ---------------------------------------------------------------------------
// Shared fixtures (fixed dates, demo data only)
// ---------------------------------------------------------------------------
const RAW_ITEM = {
  schema_version: 1,
  id: 'openreview-example-001',
  category: 'papers',
  title: 'Example Paper',
  source: { name: 'OpenReview', url: 'https://openreview.net/forum?id=demo-001' },
  authors: ['Example Author'],
  source_published_at: '2026-08-25T12:00:00Z',
  retrieved_at: '2026-08-26T00:10:00Z',
  published_at: '2026-08-26T01:00:00Z',
  summary: 'Example DailyInfo summary.',
  tags: ['hydrology'],
  briefing_ids: ['papers-2026-08-26'],
};

const RAW_BRIEFING = {
  schema_version: 1,
  id: 'papers-2026-08-26',
  category: 'papers',
  date: '2026-08-26',
  title: 'DailyInfo Papers · 2026-08-26',
  generated_at: '2026-08-26T00:45:00Z',
  published_at: '2026-08-26T01:00:00Z',
  item_ids: ['openreview-example-001'],
};

// ===========================================================================
console.log('\n[1] Identity / URL / RSS GUID contracts');
// ===========================================================================
{
  const { itemCanonicalUrl, itemGuid, briefingId } = await lib('identity.ts');
  const { SITE, withBase, absoluteUrl } = await lib('site.ts');
  const {
    categoryRoute,
    itemRoute,
    dailyRoute,
    briefingRoute,
    feedRoute,
  } = await lib('urls.ts');
  const { parseItemFrontmatter } = await lib('validate-content.ts');
  const { findRenderedItem } = await import(
    pathToFileURL(join(repo, 'scripts/verify-build-helpers.mjs')),
  );

  const base = parseItemFrontmatter(RAW_ITEM, 'items/a.md');
  check('valid fixture item parses', !!base.data, JSON.stringify(base.issues));

  const logicalItemPath = itemRoute('papers', base.data.id);
  const configuredItemHref = `${SITE.base}${logicalItemPath}`;
  const configuredItemUrl = `${SITE.origin}${configuredItemHref}`;

  const nullableSourceTime = parseItemFrontmatter(
    {
      ...RAW_ITEM,
      authors: [],
      tags: [],
      source_published_at: null,
      why_it_matters: null,
    },
    'items/nullable-source-time.md',
  );
  check(
    'optional source time/significance nulls are Web-compatible',
    !!nullableSourceTime.data,
    JSON.stringify(nullableSourceTime.issues),
  );

  const largeCollection = Array.from({ length: 20 }, (_, index) => ({
    category: 'arxiv',
    id: `arxiv-${String(index + 1).padStart(3, '0')}`,
  }));
  const visibleItem = largeCollection[largeCollection.length - 1];
  const hrefFor = (item) => withBase(itemRoute(item.category, item.id));
  const homepageWithOneVisibleItem = `<a href="${hrefFor(visibleItem)}">Visible</a>`;
  const renderedItem = findRenderedItem(
    largeCollection,
    homepageWithOneVisibleItem,
    hrefFor,
  );
  check(
    'large collection does not assume the first content entry is homepage-visible',
    !homepageWithOneVisibleItem.includes(hrefFor(largeCollection[0])) &&
      renderedItem.item === visibleItem,
  );
  check(
    'large collection representative href stays under deployment base',
    renderedItem.href === hrefFor(visibleItem) &&
      renderedItem.href.startsWith(withBase('/')),
  );

  // -- Item identity is (category, id); title is NOT an identity input ------
  const retitled = parseItemFrontmatter(
    { ...RAW_ITEM, title: 'Example Paper: Revised Title — Same Identity' },
    'items/a.md',
  );
  check(
    'title mutation ⇒ same canonical URL',
    itemCanonicalUrl('papers', base.data.id) ===
      itemCanonicalUrl('papers', retitled.data.id),
  );
  check(
    'title mutation ⇒ same RSS GUID',
    itemGuid('papers', base.data.id) === itemGuid('papers', retitled.data.id),
  );

  const reTagged = parseItemFrontmatter(
    { ...RAW_ITEM, tags: [], summary: 'Completely different summary text.' },
    'items/a.md',
  );
  check(
    'tag/summary mutation ⇒ same RSS GUID',
    itemGuid('papers', base.data.id) === itemGuid('papers', reTagged.data.id),
  );

  // -- Category mutation is an IDENTITY MIGRATION, not an update -----------
  // Same id under a different category yields a different canonical URL and
  // therefore a different GUID. The WebPublisher must NEVER do this silently
  // to an already-published Item (frozen contract, docs/contracts/publication-v1.md).
  const migrated = itemCanonicalUrl('code', base.data.id);
  check(
    'category mutation ⇒ different canonical URL (identity migration)',
    itemCanonicalUrl('papers', base.data.id) !== migrated &&
      migrated === `${SITE.origin}${withBase('/code/openreview-example-001/')}`,
  );
  check(
    'category mutation ⇒ different RSS GUID',
    itemGuid('papers', base.data.id) !== itemGuid('code', base.data.id),
  );

  // -- Briefing identity determinism ----------------------------------------
  check(
    'briefing id = {category}-{date} (deterministic)',
    briefingId('papers', '2026-08-26') === 'papers-2026-08-26' &&
      briefingId('papers', '2026-08-26') === briefingId('papers', '2026-08-26'),
  );
  check(
    'same category + same date ⇒ same briefing id (no briefing-v2)',
    briefingId('ai_news', '2026-08-26') === 'ai_news-2026-08-26',
  );

  // -- GUID === canonical URL by construction -------------------------------
  check(
    'RSS GUID === canonical Item URL',
    itemGuid('papers', base.data.id) === itemCanonicalUrl('papers', base.data.id),
  );

  // -- Deployment config is a URL concern, not an identity concern ----------
  // SITE is the single source of truth. These checks validate its shape while
  // keeping the contract suite portable across project-site and custom-domain
  // deployments.
  check('deployment origin is configured', /^https?:\/\/[^/]+$/.test(SITE.origin));
  check(
    'deployment base is normalized',
    SITE.base === '' || (SITE.base.startsWith('/') && !SITE.base.endsWith('/')),
  );
  check(
    'logical Item route excludes deployment base',
    logicalItemPath === '/papers/openreview-example-001/' &&
      (SITE.base === '' || !logicalItemPath.startsWith(SITE.base)),
  );
  check(
    'Item deployment href includes configured base',
    withBase(logicalItemPath) === configuredItemHref,
  );
  check(
    'category deployment href includes configured base',
    withBase(categoryRoute('papers')) === `${SITE.base}${categoryRoute('papers')}`,
  );
  check(
    'Daily deployment href includes configured base',
    withBase(dailyRoute('2026-08-26')) === `${SITE.base}${dailyRoute('2026-08-26')}`,
  );
  check(
    'Briefing deployment href includes configured base',
    withBase(briefingRoute('2026-08-26', 'papers')) ===
      `${SITE.base}${briefingRoute('2026-08-26', 'papers')}`,
  );
  check(
    'RSS absolute URL includes configured base',
    absoluteUrl(feedRoute()) === `${SITE.origin}${SITE.base}${feedRoute()}`,
  );
  check(
    'canonical Item URL includes configured origin and base',
    itemCanonicalUrl('papers', base.data.id) === configuredItemUrl,
  );

  // A future custom-domain build changes only deployment config. The route
  // and item identity remain exactly the same when the base becomes '/'.
  const siteModule = pathToFileURL(join(repo, 'src/lib/site.ts')).href;
  const rootOrigin = 'https://example.test';
  const rootDeployment = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { SITE, withBase, absoluteUrl } from ${JSON.stringify(siteModule)};\n` +
        `console.log(JSON.stringify({ origin: SITE.origin, base: SITE.base, publicUrl: SITE.publicUrl, href: withBase('/papers/'), url: absoluteUrl('/papers/') }));`,
    ],
    {
      cwd: repo,
      env: {
        ...process.env,
        SITE_ORIGIN: rootOrigin,
        SITE_BASE: '/',
      },
      encoding: 'utf8',
    },
  );
  let rootConfig;
  try {
    rootConfig = JSON.parse(rootDeployment.stdout);
  } catch {
    rootConfig = null;
  }
  check(
    'future root deployment changes config, not logical routes',
    rootDeployment.status === 0 &&
      rootConfig?.origin === rootOrigin &&
      rootConfig?.base === '' &&
      rootConfig?.publicUrl === `${rootOrigin}/` &&
      rootConfig?.href === '/papers/' &&
      rootConfig?.url === `${rootOrigin}/papers/`,
    rootDeployment.stderr,
  );
}

// ===========================================================================
console.log('\n[2] Schema validation (shared zod core) — fail closed');
// ===========================================================================
{
  const { parseItemFrontmatter, parseBriefingFrontmatter } = await lib('validate-content.ts');

  const rejects = (name, raw) => {
    const { data, issues } = parseItemFrontmatter(raw, 'items/x.md');
    check(name, !data && issues.length > 0, data ? 'parsed unexpectedly' : JSON.stringify(issues));
  };

  rejects('invalid category rejected', { ...RAW_ITEM, category: 'videos' });
  rejects('unsupported schema_version rejected', { ...RAW_ITEM, schema_version: 2 });
  rejects('invalid source URL rejected', {
    ...RAW_ITEM,
    source: { ...RAW_ITEM.source, url: 'not-a-url' },
  });
  rejects('non-http(s) source URL rejected', {
    ...RAW_ITEM,
    source: { ...RAW_ITEM.source, url: 'ftp://example.org/x' },
  });
  rejects('invalid timestamp rejected', {
    ...RAW_ITEM,
    source_published_at: 'yesterday',
  });
  rejects('missing stable id rejected',(({ schema_version: _s, id: _i, ...rest }) => rest)(RAW_ITEM));
  rejects('malformed stable id rejected', { ...RAW_ITEM, id: 'Bad Id!' });
  rejects('unknown field rejected (.strict())', { ...RAW_ITEM, extra_field: 'x' });

  const b = parseBriefingFrontmatter(RAW_BRIEFING, 'briefings/x.md');
  check('valid fixture briefing parses', !!b.data, JSON.stringify(b.issues));
  const badBriefing = parseBriefingFrontmatter(
    { ...RAW_BRIEFING, date: '2026-8-26' },
    'briefings/x.md',
  );
  check('malformed briefing date rejected', !badBriefing.data);
}

// ===========================================================================
console.log('\n[3] Publication integrity (shared validator) — fail closed');
// ===========================================================================
{
  const { parseItemFrontmatter, parseBriefingFrontmatter, validateParsedCollections } =
    await lib('validate-content.ts');

  const itemData = parseItemFrontmatter(RAW_ITEM, 'items/a.md').data;
  const briefingData = parseBriefingFrontmatter(RAW_BRIEFING, 'briefings/b.md').data;

  const I = (over = {}, file = 'items/a.md') => ({
    file,
    data: { ...itemData, ...over },
  });
  const B = (over = {}, file = 'briefings/b.md') => ({
    file,
    data: { ...briefingData, ...over },
  });

  const problemsOf = (items, briefings) => validateParsedCollections(items, briefings);
  const hasProblem = (problems, needle) => problems.some((p) => p.includes(needle));

  check(
    'consistent set ⇒ no problems',
    problemsOf([I()], [B()]).length === 0,
    JSON.stringify(problemsOf([I()], [B()])),
  );
  check(
    'duplicate Item id fails',
    hasProblem(problemsOf([I(), I({}, 'items/a2.md')], [B()]), 'duplicate Item id'),
  );
  check(
    'duplicate Briefing id fails',
    hasProblem(problemsOf([I()], [B(), B({}, 'briefings/b2.md')]), 'duplicate Briefing id'),
  );
  check(
    'Briefing → missing Item fails',
    hasProblem(problemsOf([I()], [B({ item_ids: ['openreview-does-not-exist'] })]), 'references missing item'),
  );
  check(
    'Item → missing Briefing fails',
    hasProblem(
      problemsOf([I({ briefing_ids: ['ghost-briefing'] })], [B()]),
      'references missing briefing',
    ),
  );
  check(
    'bidirectional membership (briefing→item direction) fails on mismatch',
    hasProblem(problemsOf([I({ briefing_ids: [] })], [B()]), 'does not list briefing'),
  );
  check(
    'bidirectional membership (item→briefing direction) fails on mismatch',
    hasProblem(
      problemsOf([I({ briefing_ids: ['papers-2026-08-26'] })], [B({ item_ids: [] })]),
      'does not include the item',
    ),
  );
  check(
    'Briefing/Item category mismatch fails',
    hasProblem(
      problemsOf(
        [I({ category: 'code', briefing_ids: ['papers-2026-08-26'] })],
        [B()],
      ),
      'of category code',
    ),
  );
  check(
    'non-deterministic briefing id fails',
    hasProblem(problemsOf([I({ briefing_ids: ['wrong-id'] })], [B({ id: 'wrong-id' })]), 'must equal "papers-2026-08-26"'),
  );
  check(
    'non-http(s) source url re-check fails (stale-cache guard)',
    hasProblem(
      problemsOf([I({ source: { name: 'X', url: 'ftp://example.org/x' } })], [B()]),
      'http(s)',
    ),
  );
}

// ===========================================================================
console.log('\n[4] Direct zod .refine() behavior (astro/zod in plain Node)');
// ===========================================================================
{
  const { z } = await import('astro/zod');
  const httpsOnly = z
    .string()
    .url()
    .refine((v) => v.startsWith('https://'), { message: 'must be https' });
  check('safeParse enforces .refine()', !httpsOnly.safeParse('ftp://example.org/x').success);
  const asyncResult = await httpsOnly.safeParseAsync('ftp://example.org/x');
  check('safeParseAsync enforces .refine()', !asyncResult.success);

  const preRefined = z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : v),
    z.string().refine((v) => v.length <= 3, { message: 'len<=3' }),
  );
  check('safeParse enforces .refine() after .preprocess()', !preRefined.safeParse(99999).success);
  check('.preprocess() transform executes', preRefined.safeParse(42).success);
}

// ===========================================================================
console.log('\n[5] Astro content-layer probe (W1-001 regression matrix)');
// ===========================================================================
{
  const probeRel = join('tests', 'refine-probe');
  const probeAbs = join(repo, probeRel);

  function runProbe(env, { clearStore = true, force = false } = {}) {
    if (clearStore) {
      rmSync(join(probeAbs, 'node_modules'), { recursive: true, force: true });
      rmSync(join(probeAbs, '.astro'), { recursive: true, force: true });
      rmSync(join(probeAbs, 'dist'), { recursive: true, force: true });
    }
    const args = [join('node_modules', 'astro', 'astro.js'), 'build', '--root', probeRel];
    if (force) args.push('--force');
    const result = spawnSync(process.execPath, args, {
      cwd: repo,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ...env },
      encoding: 'utf8',
    });
    return { code: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  }

  // --- fresh sync enforces EVERY construct, including .refine() ------------
  const expectFail = [
    'plainurl',
    'regex',
    'literal',
    'enum',
    'urlrefine',
    'stringrefine',
    'nestedrefine',
    'prerefine',
  ];
  for (const name of expectFail) {
    const { code } = runProbe({ PROBE_COLLECTIONS: name });
    check(`fresh sync rejects [${name}] violation`, code !== 0, `exit=${code}`);
  }
  const preprocess = runProbe({ PROBE_COLLECTIONS: 'preprocess' });
  check(
    'fresh sync executes .preprocess() (number entry parses)',
    preprocess.code === 0,
    `exit=${preprocess.code}`,
  );

  // --- stale-cache gotcha: tightening the schema does NOT re-validate
  //     unchanged entries (root cause of the Phase 1 "refine skipped"
  //     observation). If this assertion ever FAILS, Astro has fixed the
  //     cache invalidation — re-evaluate the stale-cache guard in
  //     src/lib/validate-content.ts (validateSkippedSchemaRules).
  let r = runProbe({ PROBE_COLLECTIONS: 'urlrefine', PROBE_REFINE: 'off' });
  check('cache-seq 1: schema without refine, fresh store ⇒ build passes', r.code === 0);

  r = runProbe({ PROBE_COLLECTIONS: 'urlrefine', PROBE_REFINE: 'on' }, { clearStore: false });
  check(
    'cache-seq 2: refine added, store intact ⇒ stale cache still passes (GOTCHA, pinned)',
    r.code === 0,
  );

  r = runProbe({ PROBE_COLLECTIONS: 'urlrefine', PROBE_REFINE: 'on' });
  check('cache-seq 3: refine added, store cleared ⇒ build fails', r.code !== 0);

  runProbe({ PROBE_COLLECTIONS: 'urlrefine', PROBE_REFINE: 'off' });
  r = runProbe(
    { PROBE_COLLECTIONS: 'urlrefine', PROBE_REFINE: 'on' },
    { clearStore: false, force: true },
  );
  check('cache-seq 4: --force clears the content cache ⇒ build fails', r.code !== 0);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
