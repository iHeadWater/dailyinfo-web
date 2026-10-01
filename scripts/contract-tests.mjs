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
  const { markdownToPlainText } = await lib('markdown.ts');

  // The shape ai_news summaries actually take once the producer complies.
  const sections = markdownToPlainText(
    '## 🧠 模型进展\n\n1. 第一条\n2. 第二条\n\n## 🏭 产业新闻\n\n1. 第三条',
  );
  check('headings and list markers are removed', !/[#*[\]`]/.test(sections), sections);
  check(
    'the words survive in order',
    sections === '🧠 模型进展 第一条 第二条 🏭 产业新闻 第三条',
    sections,
  );

  check('bold markers are removed', markdownToPlainText('🏢 **中国移动四川公司**') === '🏢 中国移动四川公司');
  check('italic markers are removed', markdownToPlainText('前缀 *强调* 后缀') === '前缀 强调 后缀');
  check(
    'links collapse to their text',
    markdownToPlainText('见 [原文](https://example.org/a)') === '见 原文',
  );
  check(
    'images collapse to their alt text',
    markdownToPlainText('![示意](https://example.org/i.png)') === '示意',
  );
  check(
    'quote markers are removed',
    markdownToPlainText('> 引用的一行') === '引用的一行',
  );
  check(
    'line breaks collapse so truncation counts visible length',
    markdownToPlainText('第一段\n\n第二段') === '第一段 第二段',
  );
  check(
    'plain prose is returned unchanged',
    markdownToPlainText('该研究揭示了 LLM 智能体工作流中的普遍现象。') ===
      '该研究揭示了 LLM 智能体工作流中的普遍现象。',
  );

  // Boundary guards. A rule that cannot tell markup from ordinary text must
  // stay its hand: dropping characters from prose is a visible defect, whereas
  // leaving one span un-stripped is merely an imperfect preview.
  check(
    'intraword underscores are not treated as emphasis',
    markdownToPlainText('变量 model_name 与 config_value') === '变量 model_name 与 config_value',
    markdownToPlainText('变量 model_name 与 config_value'),
  );
  check(
    'arithmetic asterisks are not treated as emphasis',
    markdownToPlainText('5*8=40 与 3*4=12') === '5*8=40 与 3*4=12',
    markdownToPlainText('5*8=40 与 3*4=12'),
  );
  check(
    'code spans are shielded from the emphasis rules',
    markdownToPlainText('使用 `*args` 和 `**kwargs` 参数') === '使用 *args 和 **kwargs 参数' &&
      markdownToPlainText('文件名 `data_2026_08.csv`') === '文件名 data_2026_08.csv',
    markdownToPlainText('文件名 `data_2026_08.csv`'),
  );
  // \w is ASCII-only, so CJK never counts as "inside a word" and the guards
  // above must not stop Chinese text from being un-marked.
  check(
    'CJK runs adjacent to asterisks are still stripped',
    markdownToPlainText('进展**重要**突破') === '进展重要突破',
    markdownToPlainText('进展**重要**突破'),
  );
  // Underscores are the opposite case: CommonMark forbids intraword `_`
  // emphasis using Unicode letters, so the renderer shows these literally and
  // this function must not delete what the page displays. Asserted against
  // renderSummaryMarkdown's behaviour, which is the ground truth here.
  check(
    'CJK-adjacent underscores survive (no intraword emphasis)',
    markdownToPlainText('进展_重要_突破') === '进展_重要_突破' &&
      markdownToPlainText('中文_English_中文') === '中文_English_中文',
    markdownToPlainText('进展_重要_突破'),
  );
  check(
    'a lone list marker on its own line is prose, not a list',
    markdownToPlainText('2a\n+\n1') === '2a + 1',
    JSON.stringify(markdownToPlainText('2a\n+\n1')),
  );
  // micromark classifies by UTF-16 code unit, so an astral code point looks
  // like a lone surrogate and ends up word-internal, as do combining marks.
  // The boundary class mirrors that, otherwise these underscores vanish here
  // while the rendered page still shows them.
  check(
    'underscores beside astral and combining characters survive',
    markdownToPlainText('😀_重要_😀') === '😀_重要_😀' &&
      markdownToPlainText('⚠️_注意_⚠️') === '⚠️_注意_⚠️',
    markdownToPlainText('😀_重要_😀'),
  );
  // The sentinel is an implementation detail, but an input containing it must
  // not silently turn into "undefined"; the guard in markdown.ts skips
  // shielding entirely in that case.
  {
    const sentinel = String.fromCharCode(0);
    const withNul = `正文${sentinel}0${sentinel}文字`;
    check(
      'input already containing the shield sentinel survives',
      markdownToPlainText(withNul) === withNul,
      JSON.stringify(markdownToPlainText(withNul)),
    );
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
