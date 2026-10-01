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
 *   6. Source grouping (journal presentation, pure functions)
 *   7. Publication labels (shared format helpers)
 *   8. Item summary markdown rendering (sanitized, heading levels)
 *   9. Plain-text summaries (card previews, RSS descriptions)
 *  10. Homepage ranking (topic slots + journal prestige, injected policy)
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

  // -- source.display_name: optional display/grouping field ------------------
  // RAW_ITEM stays a "no display_name" baseline on purpose: most rejects()
  // above use it, so the absent-field path is covered by every one of them.
  const withDisplayName = parseItemFrontmatter(
    { ...RAW_ITEM, source: { ...RAW_ITEM.source, display_name: 'Journal of Hydrology' } },
    'items/a.md',
  );
  check(
    'source.display_name accepted when non-empty',
    withDisplayName.data?.source.display_name === 'Journal of Hydrology',
    JSON.stringify(withDisplayName.issues),
  );
  const nullDisplayName = parseItemFrontmatter(
    { ...RAW_ITEM, source: { ...RAW_ITEM.source, display_name: null } },
    'items/a.md',
  );
  check(
    'source.display_name accepts explicit null',
    !!nullDisplayName.data,
    JSON.stringify(nullDisplayName.issues),
  );
  rejects('empty source.display_name rejected', {
    ...RAW_ITEM,
    source: { ...RAW_ITEM.source, display_name: '' },
  });

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

  // -- source labels must be consistent across a source (§11 rule 9) --------
  // Compares the RESOLVED label, so only genuinely different renderings fail.
  const labelProblems = (sources) =>
    problemsOf(
      sources.map((source, index) =>
        I({ source }, index === 0 ? 'items/a.md' : `items/${index}.md`),
      ),
      [B({ item_ids: [] })],
    );

  check(
    'differing resolved labels fail',
    hasProblem(
      labelProblems([
        { name: 'nature', display_name: 'Nature', url: 'https://example.org/a' },
        { name: 'nature', display_name: 'NATURE', url: 'https://example.org/b' },
      ]),
      'renders as',
    ),
  );
  check(
    'a display_name equal to source.name matches an omitted field',
    !hasProblem(
      labelProblems([
        { name: 'nature', display_name: 'nature', url: 'https://example.org/a' },
        { name: 'nature', url: 'https://example.org/b' },
      ]),
      'renders as',
    ),
  );
  check(
    'absent and explicit null display_name agree',
    !hasProblem(
      labelProblems([
        { name: 'nature', url: 'https://example.org/a' },
        { name: 'nature', display_name: null, url: 'https://example.org/b' },
      ]),
      'renders as',
    ),
  );
  check(
    'a single item can never disagree with itself',
    !hasProblem(labelProblems([{ name: 'nature', display_name: 'Nature', url: 'https://example.org/a' }]), 'renders as'),
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

// ===========================================================================
console.log('\n[6] Source grouping (journal presentation)');
// ===========================================================================
{
  const { groupItemsBySource, sourceDisplayName, defaultOpenSourceKey } = await lib('sources.ts');

  // Minimal structural stand-in for an ItemEntry — the helpers only read
  // data.source, so the tests need no astro:content types.
  const item = (name, display_name, published_at = '2026-08-26T01:00:00Z') => ({
    data: { source: { name, ...(display_name === undefined ? {} : { display_name }) }, published_at },
  });
  const labelsOf = (groups) => groups.map((group) => group.label).join(' | ');

  // -- display name resolution ---------------------------------------------
  check(
    'missing display_name falls back to source.name',
    sourceDisplayName({ name: 'journal_hydrology' }) === 'journal_hydrology',
  );
  check(
    'explicit null display_name falls back to source.name',
    sourceDisplayName({ name: 'journal_hydrology', display_name: null }) === 'journal_hydrology',
  );
  check(
    'non-empty display_name wins over source.name',
    sourceDisplayName({ name: 'journal_hydrology', display_name: 'Journal of Hydrology' }) ===
      'Journal of Hydrology',
  );

  // -- grouping -------------------------------------------------------------
  const single = groupItemsBySource([
    item('arxiv_cs_ai', 'arXiv CS.AI'),
    item('arxiv_cs_ai', 'arXiv CS.AI'),
  ]);
  check('single source ⇒ exactly one group', single.length === 1);
  check('single group keeps its display name', single[0].label === 'arXiv CS.AI');
  check('single group key is source.name', single[0].key === 'arxiv_cs_ai');
  check('empty input ⇒ no groups', groupItemsBySource([]).length === 0);

  const ordered = groupItemsBySource([
    item('pnas', 'PNAS', '2026-08-26T03:00:00Z'),
    item('nature', 'Nature', '2026-08-26T02:00:00Z'),
    item('pnas', 'PNAS', '2026-08-26T01:00:00Z'),
  ]);
  check(
    'grouping preserves input order within a group',
    ordered
      .find((group) => group.key === 'pnas')
      .items.map((entry) => entry.data.published_at)
      .join() === ['2026-08-26T03:00:00Z', '2026-08-26T01:00:00Z'].join(),
    ordered.find((group) => group.key === 'pnas').items.length,
  );
  check(
    'groups are returned sorted by label, not by input order',
    labelsOf(ordered) === 'Nature | PNAS',
    labelsOf(ordered),
  );

  // -- ordering (pinned: do not swap for a bare localeCompare, which would
  //    follow the host locale and make build output machine-dependent) ------
  const latinAndCjk = groupItemsBySource([
    item('shuili_xuebao', '水利学报'),
    item('nature', 'Nature'),
    item('pnas', 'PNAS'),
    item('essd', 'Earth System Science Data'),
  ]);
  check(
    'journals sort alphabetically, CJK labels after Latin',
    labelsOf(latinAndCjk) === 'Earth System Science Data | Nature | PNAS | 水利学报',
    labelsOf(latinAndCjk),
  );
  check(
    'sorting is case- and accent-insensitive',
    labelsOf(groupItemsBySource([item('a', 'zeta'), item('b', 'Écologie'), item('c', 'Alpha')])) ===
      'Alpha | Écologie | zeta',
    labelsOf(groupItemsBySource([item('a', 'zeta'), item('b', 'Écologie'), item('c', 'Alpha')])),
  );
  check(
    'groups without display_name still sort deterministically',
    labelsOf(groupItemsBySource([item('water_research'), item('journal_hydrology')])) ===
      'journal_hydrology | water_research',
    labelsOf(groupItemsBySource([item('water_research'), item('journal_hydrology')])),
  );

  // -- default open group ---------------------------------------------------
  check(
    'default open = the largest group',
    defaultOpenSourceKey(
      groupItemsBySource([
        item('pnas', 'PNAS'),
        item('nature', 'Nature'),
        item('pnas', 'PNAS'),
        item('pnas', 'PNAS'),
      ]),
    ) === 'pnas',
  );
  check(
    'default open tie-breaks to the alphabetically first group',
    defaultOpenSourceKey(
      groupItemsBySource([item('pnas', 'PNAS'), item('nature', 'Nature')]),
    ) === 'nature',
  );
  check('no default open for a single group', defaultOpenSourceKey(single) === undefined);
  check('no default open for empty input', defaultOpenSourceKey([]) === undefined);
}

// ===========================================================================
console.log('\n[7] Publication labels (shared format helpers)');
// ===========================================================================
{
  const { articleCount, articleLabel } = await lib('format.ts');

  check('singular article label', articleLabel(1) === 'Article');
  check(
    'plural article label covers zero and many',
    articleLabel(0) === 'Articles' && articleLabel(2) === 'Articles',
  );
  check(
    'article count composes number and label',
    articleCount(1) === '1 Article' && articleCount(20) === '20 Articles',
  );
}

// ===========================================================================
console.log('\n[8] Item summary markdown rendering');
// ===========================================================================
{
  const { renderSummaryMarkdown } = await lib('markdown.ts');

  const bold = await renderSummaryMarkdown('🏢 **中国移动四川公司** — 2027秋季校园招聘');
  check(
    'renders markdown bold instead of literal asterisks',
    bold.includes('<strong>中国移动四川公司</strong>') && !bold.includes('**'),
    bold,
  );

  const sections = await renderSummaryMarkdown('## 🧠 模型进展\n\n1. 第一条\n2. 第二条');
  check(
    'renders section headings (the ai_news four-part shape)',
    /<h3[^>]*>🧠 模型进展<\/h3>/.test(sections),
    sections,
  );
  check('renders numbered items as list items', sections.includes('<li>'), sections);

  // Headings shift down one level so they nest under the panel's own h2 label;
  // this is also what keeps a producer-supplied `#` from rendering a second h1.
  const shifted = await renderSummaryMarkdown('# 顶层标题\n\n## 次级标题');
  check('summary headings never reach h1', !/<h1/.test(shifted), shifted);
  check('a producer h1 lands on h2', /<h2[^>]*>顶层标题<\/h2>/.test(shifted), shifted);
  check('sections land on h3', /<h3[^>]*>次级标题<\/h3>/.test(shifted), shifted);

  const prose = await renderSummaryMarkdown('该研究揭示了 LLM 智能体工作流中的普遍现象与触发机制。');
  check(
    'plain prose stays a single paragraph',
    /^<p>该研究揭示了[\s\S]*<\/p>$/.test(prose.trim()),
    prose,
  );

  // Regression guard for the caller: it must pass the RAW field. An
  // entity-decoded string turns &lt;script&gt; back into a raw node, which the
  // sanitizer drops whole — taking the word "script" with it. Assert on the
  // surviving words, not on a particular entity spelling: the serializer is
  // free to emit &#x3C; instead of &lt;.
  const entities = await renderSummaryMarkdown('使用 &lt;script&gt; 标签时注意');
  check(
    'entity-escaped markup stays visible text instead of being dropped',
    entities.includes('script') &&
      entities.includes('标签时注意') &&
      !entities.includes('<script'),
    entities,
  );

  // Untrusted input: the summary is LLM output derived from external sources.
  // Sanitizing is the ONLY barrier here — Astro's pipeline always includes
  // rehype-raw, so without rehypeSanitize the same input renders live markup.
  const script = await renderSummaryMarkdown('正文<script>alert(1)</script>结尾');
  check('raw <script> never survives as live markup', !script.includes('<script'), script);
  const handler = await renderSummaryMarkdown('<img src=x onerror=alert(1)>');
  check('inline event handlers never survive as live markup', !/<img[^>]*onerror/i.test(handler), handler);
  // With raw HTML unreachable, a markdown link is the one path a dangerous
  // scheme could still take.
  const jsUrl = await renderSummaryMarkdown('[点我](javascript:alert(1))');
  check('javascript: link targets are stripped', !/href\s*=\s*["']?javascript:/i.test(jsUrl), jsUrl);

  // Guards smartypants: enabling it would silently rewrite the producer's
  // straight quotes into curly ones, editing content the web layer must render
  // verbatim.
  const quotes = await renderSummaryMarkdown('模型存在"情境幻觉"问题');
  check('straight quotes are left untouched', quotes.includes('"情境幻觉"'), quotes);
}

// ===========================================================================
console.log('\n[9] Plain-text summaries (card previews, RSS, meta descriptions)');
// ===========================================================================
{
  const { summaryPlainText } = await lib('markdown.ts');

  // Plain text is DERIVED from the renderer — render, then take the visible
  // text — so the two cannot disagree. Three review rounds each found a fresh
  // divergence while the stripping rules were written out by hand.
  //
  // These are golden expectations, every one captured from renderSummaryMarkdown
  // itself. They document what survives and what is removed, and they fail if
  // the derivation is ever replaced by hand-rolled rules again: the second block
  // below is exactly the set those rules kept getting wrong.
  const expectations = [
    // Markers the renderer consumes — gone here too, along with their delimiters.
    ['🏢 **中国移动四川公司** — 2027秋季校园招聘', '🏢 中国移动四川公司 — 2027秋季校园招聘'],
    ['_重点_', '重点'],
    ['## 🧠 模型进展\n\n1. 第一条\n2. 第二条', '🧠 模型进展 第一条 第二条'],
    ['> 引用的一行', '引用的一行'],
    ['见 [原文](https://example.org/a)', '见 原文'],
    ['![示意](https://example.org/i.png)', '示意'],
    ['第一段\n\n第二段', '第一段 第二段'],

    // Markers the renderer keeps as literal text. Deleting these is the defect
    // class every hand-written rule re-introduced: intraword underscores,
    // arithmetic asterisks, escapes, astral neighbours, a 2. that cannot
    // interrupt a paragraph, and markers inside code spans.
    ['中*(b)*文', '中*(b)*文'],
    ['成本*(万元)*下降', '成本*(万元)*下降'],
    ['\\*不是强调\\*', '*不是强调*'],
    ['总结如下\n2. 第二', '总结如下 2. 第二'],
    ['进展_重要_突破', '进展_重要_突破'],
    ['中文_English_中文', '中文_English_中文'],
    ['😀_重要_😀', '😀_重要_😀'],
    ['⚠️_注意_⚠️', '⚠️_注意_⚠️'],
    ['变量 model_name 与 config_value', '变量 model_name 与 config_value'],
    ['文件名 `data_2026_08.csv`', '文件名 data_2026_08.csv'],
    ['使用 `*args` 和 `**kwargs` 参数', '使用 *args 和 **kwargs 参数'],

    // Accepted consequence of matching the renderer: CommonMark reads this as
    // an emphasis span, so the item page drops the asterisks too. Card and page
    // agreeing matters more than a single faithful-to-source case.
    ['5*8=40 与 3*4=12', '58=40 与 34=12'],

    // Plain prose is untouched.
    ['该研究揭示了 LLM 智能体工作流中的普遍现象。', '该研究揭示了 LLM 智能体工作流中的普遍现象。'],
  ];

  for (const [input, expected] of expectations) {
    const actual = await summaryPlainText(input);
    check(
      `plain text: ${JSON.stringify(input).slice(0, 44)}`,
      actual === expected,
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ===========================================================================
console.log('\n[10] Homepage ranking (papers: topic slots + prestige)');
// ===========================================================================
{
  const { rankForCategory } = await lib('ranking/index.ts');
  const { allocateSlots, computeRelevance, computePrestige } = await lib('ranking/rank.ts');
  const { PAPERS_POLICY } = await lib('ranking/policy.ts');

  // Mechanism tests inject their OWN policy, so retuning the shipped tables in
  // policy.ts cannot break a single one of them. That separation is the whole
  // point of the module split: the shipped values are pinned separately, in the
  // handful of assertions that are actually about those values.
  const TEST_POLICY = {
    relevantSources: new Set(['hydro_j']),
    titlePattern: /\b(hydrolog|streamflow)/i,
    relevanceGate: 2,
    prestige: new Map([
      ['top_j', 4],
      ['mid_j', 2],
    ]),
    defaultPrestige: 1,
    relevantSlots: 2,
  };

  const paper = ({
    id,
    journal,
    title = 'A neutral paper title',
    sourceTime = null,
    publishedAt = '2026-10-01T01:00:15Z',
  }) => ({
    id,
    data: {
      title,
      source: { name: journal },
      source_published_at: sourceTime,
      published_at: publishedAt,
    },
  });
  const idsOf = (entries) => entries.map((entry) => entry.id).join(' | ');
  const relevanceOf = (item, policy = TEST_POLICY) => computeRelevance(item, policy);
  const prestigeOf = (item, policy = TEST_POLICY) => computePrestige(item, policy);

  // --- A. mechanism: scoring ------------------------------------------------
  const onTopic = paper({ id: 'a', journal: 'hydro_j' });
  check('topic source alone scores 2', relevanceOf(onTopic) === 2, relevanceOf(onTopic));
  check(
    'topic title alone scores 1',
    relevanceOf(paper({ id: 'a', journal: 'plain_j', title: 'Streamflow forecasting with transformers' })) === 1,
  );
  check(
    'source and title add rather than max',
    relevanceOf(paper({ id: 'a', journal: 'hydro_j', title: 'Streamflow forecasting' })) === 3,
  );
  check('an off-topic item scores 0', relevanceOf(paper({ id: 'a', journal: 'plain_j' })) === 0);
  // 'river' is a substring of 'driver'; the leading \b is what stops this.
  check(
    'the title pattern does not match inside a word',
    relevanceOf(paper({ id: 'a', journal: 'plain_j', title: 'A driver-based framework for model selection' })) === 0,
  );
  check(
    'the title pattern is case-insensitive',
    relevanceOf(paper({ id: 'a', journal: 'plain_j', title: 'HYDROLOGICAL PROCESSES AT SCALE' })) === 1,
  );
  check(
    'prestige reads the table and falls back to the default',
    prestigeOf(paper({ id: 'a', journal: 'top_j' })) === 4 &&
      prestigeOf(paper({ id: 'a', journal: 'mid_j' })) === 2 &&
      prestigeOf(paper({ id: 'a', journal: 'plain_j' })) === 1,
  );
  // If the mechanism had its own hard-coded table, swapping the policy object
  // would change nothing.
  check(
    'scoring is driven by the injected policy, not by module state',
    relevanceOf(onTopic, { ...TEST_POLICY, relevantSources: new Set() }) === 0 &&
      relevanceOf(onTopic, { ...TEST_POLICY, relevanceGate: 0 }) === 2,
  );

  // --- A2. the shipped policy ------------------------------------------------
  const shippedRelevance = (sourceName, title = 'A neutral paper title') =>
    computeRelevance(paper({ id: 'a', journal: sourceName, title }), PAPERS_POLICY);
  check('shipped policy knows journal_hydrology', shippedRelevance('journal_hydrology') >= 2);
  check('shipped policy knows nature_water', shippedRelevance('nature_water') >= 2);
  check('shipped policy knows hydrological_processes', shippedRelevance('hydrological_processes') >= 2);
  // The publisher emits the underscored slug. Matching is exact, not fuzzy, so
  // a renamed source drops out silently rather than half-matching -- pinning
  // the near miss documents that this is the intended behaviour.
  check(
    'source matching is exact on the slug the publisher emits',
    shippedRelevance('shuili_xuebao') >= 2 && shippedRelevance('shuilixuebao') < 2,
  );
  check(
    'shipped prestige tiers hold',
    computePrestige(paper({ id: 'a', journal: 'nature' }), PAPERS_POLICY) === 4 &&
      computePrestige(paper({ id: 'a', journal: 'journal_hydrology' }), PAPERS_POLICY) === 3 &&
      computePrestige(paper({ id: 'a', journal: 'unlisted_journal' }), PAPERS_POLICY) === 1,
  );
  check('shipped policy reserves two topic slots', PAPERS_POLICY.relevantSlots === 2);
  // Both sides are exact: a plain_j source contributes 0, so the title is the
  // only term in play and `< 2` would be true even for a pattern that matched
  // everything.
  check(
    'shipped title pattern keeps the word-boundary guard',
    shippedRelevance('plain_j', 'A driver-based framework') === 0 &&
      shippedRelevance('plain_j', 'River discharge') === 1,
  );
  // rank.ts calls `.test()` on this object directly. g and y are the two flags
  // that advance lastIndex, and either one makes the match stateful: three
  // `.test()` calls on one title give [true,true,true] for /i but
  // [true,false,true] for both /ig and /iy, i.e. every other Item is missed.
  check(
    'shipped title pattern is stateless',
    PAPERS_POLICY.titlePattern.global === false && PAPERS_POLICY.titlePattern.sticky === false,
  );

  // --- B. mechanism: slot allocation -----------------------------------------
  const acceptance = [
    paper({ id: 'hydro_j-3', journal: 'hydro_j', sourceTime: '2026-10-01T01:00:01Z' }),
    paper({ id: 'hydro_j-2', journal: 'hydro_j', sourceTime: '2026-10-01T01:00:02Z' }),
    paper({ id: 'hydro_j-1', journal: 'hydro_j', sourceTime: '2026-10-01T01:00:03Z' }),
    paper({ id: 'top_j-1', journal: 'top_j' }),
    paper({ id: 'mid_j-1', journal: 'mid_j' }),
    paper({ id: 'plain_j-1', journal: 'plain_j' }),
  ];
  const ranked = allocateSlots(acceptance, TEST_POLICY);
  check(
    'the leading slots go to on-topic items',
    idsOf(ranked.slice(0, 2)) === 'hydro_j-1 | hydro_j-2',
    idsOf(ranked),
  );
  check(
    'the next slot goes to the most prestigious item left',
    ranked[2].id === 'top_j-1',
    idsOf(ranked),
  );
  // Without the relevance key in the fallback comparator this reverses: both
  // items tie on prestige and time, so the id tiebreak would pick -plain.
  const fallbackTie = [
    paper({ id: 'top_j-plain', journal: 'top_j' }),
    paper({ id: 'top_j-topic', journal: 'top_j', title: 'Streamflow forecasting' }),
  ];
  check(
    'within equal prestige the fallback prefers the on-topic item',
    allocateSlots(fallbackTie, TEST_POLICY)[0].id === 'top_j-topic',
    idsOf(allocateSlots(fallbackTie, TEST_POLICY)),
  );
  // The fallback comparator's THIRD key. Ids are ordered opposite to the dates,
  // so dropping the date key leaves the id tiebreak to decide and silently
  // reverses card 3 -- no other assertion in this section notices, because
  // every other input either ties on the date or is filtered into the topic
  // comparator, which has its own pinned copy of the key.
  const fallbackDates = [
    paper({ id: 'top_j-a', journal: 'top_j', sourceTime: '2026-09-01T00:00:00Z' }),
    paper({ id: 'top_j-b', journal: 'top_j', sourceTime: '2026-09-30T00:00:00Z' }),
  ];
  check(
    'the fallback breaks equal prestige on the real source date',
    idsOf(allocateSlots(fallbackDates, TEST_POLICY)) === 'top_j-b | top_j-a',
    idsOf(allocateSlots(fallbackDates, TEST_POLICY)),
  );
  // relevantSlots is a knob, and 0 is a legitimate setting: topic slots off.
  check(
    'zero topic slots yields the plain general ranking',
    idsOf(allocateSlots(acceptance, { ...TEST_POLICY, relevantSlots: 0 })) ===
      'top_j-1 | mid_j-1 | hydro_j-1 | hydro_j-2 | hydro_j-3 | plain_j-1',
    idsOf(allocateSlots(acceptance, { ...TEST_POLICY, relevantSlots: 0 })),
  );
  // Both orders below are deliberately not the expected order, so a passthrough
  // implementation fails them instead of matching by coincidence.
  check(
    'a single on-topic item is topped up from the general ranking',
    idsOf(
      allocateSlots(
        [
          paper({ id: 'plain_j-1', journal: 'plain_j' }),
          paper({ id: 'top_j-1', journal: 'top_j' }),
          paper({ id: 'hydro_j-1', journal: 'hydro_j' }),
        ],
        TEST_POLICY,
      ).slice(0, 2),
    ) === 'hydro_j-1 | top_j-1',
  );
  check(
    'with no on-topic items the ranking is pure prestige',
    idsOf(
      allocateSlots(
        [
          paper({ id: 'plain_j-1', journal: 'plain_j' }),
          paper({ id: 'top_j-1', journal: 'top_j' }),
          paper({ id: 'mid_j-1', journal: 'mid_j' }),
        ],
        TEST_POLICY,
      ),
    ) === 'top_j-1 | mid_j-1 | plain_j-1',
  );
  check(
    'with no off-topic items the topic fills every slot',
    idsOf(allocateSlots(acceptance.slice(0, 3), TEST_POLICY)) === 'hydro_j-1 | hydro_j-2 | hydro_j-3',
  );
  check('a short input is returned whole', allocateSlots([paper({ id: 'a', journal: 'top_j' })], TEST_POLICY).length === 1);
  check('an empty input stays empty', allocateSlots([], TEST_POLICY).length === 0);
  check(
    'no item is emitted twice',
    new Set(ranked.map((entry) => entry.id)).size === ranked.length,
    idsOf(ranked),
  );
  // The gate is a policy field, not a constant baked into the allocator.
  const gateItems = [
    paper({ id: 'title-only', journal: 'plain_j', title: 'Streamflow forecasting' }),
    paper({ id: 'source-only', journal: 'top_j' }),
  ];
  check(
    'the relevance gate is policy-driven',
    allocateSlots(gateItems, TEST_POLICY)[0].id === 'source-only' &&
      allocateSlots(gateItems, { ...TEST_POLICY, relevanceGate: 1 })[0].id === 'title-only',
  );

  // --- C. mechanism: comparator details --------------------------------------
  const timeTie = [
    paper({ id: 'hydro_j-aaa', journal: 'hydro_j', sourceTime: '2026-09-29T02:30:00Z' }),
    paper({ id: 'hydro_j-zzz', journal: 'hydro_j', sourceTime: '2026-10-01T01:00:15Z' }),
  ];
  // Both share published_at; only source_published_at separates them. Ranking
  // on the batch timestamp would leave the id tiebreak to decide, putting -aaa
  // first -- the wrong answer, and the one the site shipped before this module.
  check(
    'topic slots break ties on the real source date, not the batch stamp',
    allocateSlots(timeTie, TEST_POLICY)[0].id === 'hydro_j-zzz',
    idsOf(allocateSlots(timeTie, TEST_POLICY)),
  );
  // Listed in the WRONG order on purpose: only a real fallback puts -null
  // first, so "unchanged input order" cannot pass this by accident.
  const nullSourceTime = [
    paper({ id: 'hydro_j-dated', journal: 'hydro_j', sourceTime: '2026-09-30T08:00:00Z', publishedAt: '2026-10-01T01:00:15Z' }),
    paper({ id: 'hydro_j-null', journal: 'hydro_j', sourceTime: null, publishedAt: '2026-10-01T01:00:15Z' }),
  ];
  // Date.parse(null) is NaN, and a NaN in a comparator silently degrades the
  // whole sort to input order rather than failing.
  check(
    'a null source date falls back to published_at',
    allocateSlots(nullSourceTime, TEST_POLICY)[0].id === 'hydro_j-null',
    idsOf(allocateSlots(nullSourceTime, TEST_POLICY)),
  );
  // '.' is 0x2E and '_' is 0x5F, so code-unit order puts x.y first -- while
  // 'x.y'.localeCompare('x_y') is 1, i.e. the opposite. This pins the tiebreak
  // to code units: localeCompare would follow the host locale (see sources.ts).
  const idTie = [paper({ id: 'x_y', journal: 'plain_j' }), paper({ id: 'x.y', journal: 'plain_j' })];
  check(
    'fully tied items order by code unit, not locale',
    idsOf(allocateSlots(idTie, TEST_POLICY)) === 'x.y | x_y',
    idsOf(allocateSlots(idTie, TEST_POLICY)),
  );
  check(
    'ranking is idempotent',
    idsOf(allocateSlots(allocateSlots(acceptance, TEST_POLICY), TEST_POLICY)) === idsOf(ranked),
  );
  // ISO_TIMESTAMP validates a timestamp's SHAPE, not its calendar range, so
  // these reach the comparator and parse to NaN. An unguarded NaN drops out of
  // the `||` chain, making the comparison non-transitive.
  //
  // The sorting-last clause is what detects that regression here. The
  // permutation clauses on top of it guard a different breakage: an
  // implementation that is order-dependent yet happens to be right on the
  // first permutation. Both clauses earn their place; do not read the
  // permutations as the detector for this particular bug.
  const unparseable = [
    paper({ id: 'plain_j-b', journal: 'plain_j', sourceTime: '2026-06-01T00:00:00Z' }),
    paper({ id: 'plain_j-a', journal: 'plain_j', sourceTime: '2026-13-01T00:00:00Z' }),
    paper({ id: 'plain_j-c', journal: 'plain_j', sourceTime: '2026-01-01T00:00:00Z' }),
  ];
  const unparseableOrder = (items) => idsOf(allocateSlots(items, TEST_POLICY));
  check(
    'an unparseable timestamp sorts last without breaking transitivity',
    unparseableOrder(unparseable) === 'plain_j-b | plain_j-c | plain_j-a' &&
      unparseableOrder([...unparseable].reverse()) === 'plain_j-b | plain_j-c | plain_j-a' &&
      unparseableOrder([unparseable[1], unparseable[2], unparseable[0]]) === 'plain_j-b | plain_j-c | plain_j-a',
    unparseableOrder(unparseable),
  );

  // --- D. scope, purity, immutability ----------------------------------------
  // Pre-shuffled, and carrying an item that the papers policy would happily
  // rank -- otherwise "unchanged" is satisfied by any sort at all.
  const offTopicCategories = ['ai_news', 'code', 'resource', 'arxiv'];
  const shuffled = [
    paper({ id: 'z-3', journal: 'hydro_j', title: 'Streamflow forecasting' }),
    paper({ id: 'a-1', journal: 'top_j' }),
    paper({ id: 'm-2', journal: 'plain_j' }),
  ];
  check(
    'every other category is returned untouched',
    offTopicCategories.every((category) => idsOf(rankForCategory(category, shuffled)) === 'z-3 | a-1 | m-2'),
  );
  check(
    'the public entry is a pure forward to the allocator',
    idsOf(rankForCategory('papers', acceptance)) === idsOf(allocateSlots(acceptance, PAPERS_POLICY)),
  );
  const frozen = Object.freeze(acceptance.map((entry) => Object.freeze({ ...entry, data: Object.freeze(entry.data) })));
  let frozeThrew = false;
  try {
    allocateSlots(frozen, TEST_POLICY);
  } catch {
    frozeThrew = true;
  }
  // A mutating implementation calls items.sort(), which throws on a frozen
  // array in ESM strict mode -- a louder failure than comparing before/after.
  check('ranking never mutates its input', !frozeThrew);
  const before = idsOf(acceptance);
  const returned = allocateSlots(acceptance, TEST_POLICY);
  check(
    'ranking returns a new array and leaves the input in input order',
    returned !== acceptance && idsOf(acceptance) === before,
  );
  check(
    'ranking drops nothing',
    returned.length === acceptance.length &&
      [...returned].map((entry) => entry.id).sort().join() === [...acceptance].map((entry) => entry.id).sort().join(),
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
