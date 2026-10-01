import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncDailyInfo } from './dailyinfo-sync.mjs';

/** Counted in scenarios, matching scripts/dailyinfo-publish.tests.mjs. */
let passed = 0;

const root = mkdtempSync(join(tmpdir(), 'dailyinfo-sync-'));
const workspace = join(root, 'workspace');
const web = join(root, 'web');
const sources = join(root, 'sources.json');

try {
  mkdirSync(join(workspace, 'briefings', 'code'), { recursive: true });
  writeFileSync(sources, JSON.stringify({ sources: [{ name: 'github_trending', display_name: 'GitHub Trending', category: 'code', url: 'https://github.com/trending' }] }));
  writeFileSync(join(workspace, 'briefings', 'code', 'github_trending_briefing_2026-09-26.md'), '# GitHub Trending\n\n1. **Example** — summary.');

  const options = { sourceRoot: workspace, webRoot: web, sourcesConfig: sources, includePushed: false, date: '', apply: true };
  const first = syncDailyInfo(options);
  assert.equal(first.added, 1);
  assert.equal(first.briefings_written, 1);
  const itemPath = join(web, 'src/content/items/generated/code/dailyinfo-code-github_trending-2026-09-26.md');
  const briefingPath = join(web, 'src/content/briefings/generated/2026/09/26/code.md');
  const firstItem = readFileSync(itemPath, 'utf8');
  const firstBriefing = readFileSync(briefingPath, 'utf8');
  assert.match(firstItem, /id: "dailyinfo-code-github_trending-2026-09-26"/);
  // Registry display_name must reach the frontmatter, so this publisher's
  // output carries the same journal label as the backend's.
  assert.match(firstItem, /display_name: "GitHub Trending"/);
  assert.match(briefingPath, /2026\/09\/26\/code\.md$/);
  passed += 1;

  const second = syncDailyInfo(options);
  assert.equal(second.added, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 1);
  assert.equal(second.briefings_written, 0);
  assert.equal(readFileSync(itemPath, 'utf8'), firstItem);
  assert.equal(readFileSync(briefingPath, 'utf8'), firstBriefing);
  passed += 1;

  writeFileSync(join(workspace, 'briefings', 'code', 'github_trending_briefing_2026-09-26.md'), '# GitHub Trending\n\n1. **Example** — updated summary.');
  const third = syncDailyInfo(options);
  assert.equal(third.updated, 1);
  assert.equal(third.added, 0);
  assert.equal((readFileSync(briefingPath, 'utf8').match(/dailyinfo-sync:start/g) || []).length, 1);
  passed += 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}

// --- retention window -------------------------------------------------------
//
// The web shows a rolling window, not an archive: the publisher writes the
// newest N days and PRUNES what falls out. Two properties matter most and are
// pinned below -- the window is anchored to the newest CONTENT date (so a
// collection outage cannot empty a public site), and pruning never touches
// content the sync did not write.
{
  const wroot = mkdtempSync(join(tmpdir(), 'dailyinfo-window-'));
  const workspace = join(wroot, 'workspace');
  const web = join(wroot, 'web');
  const sources = join(wroot, 'sources.json');
  const itemPath = (date) => join(web, `src/content/items/generated/code/dailyinfo-code-github_trending-${date}.md`);
  const briefingPath = (date) => {
    const [y, m, d] = date.split('-');
    return join(web, `src/content/briefings/generated/${y}/${m}/${d}/code.md`);
  };
  const write = (date, label = date) =>
    writeFileSync(join(workspace, 'briefings', 'code', `github_trending_briefing_${date}.md`),
      `# GitHub Trending\n\n1. **${label}** — summary.`);

  try {
    mkdirSync(join(workspace, 'briefings', 'code'), { recursive: true });
    writeFileSync(sources, JSON.stringify({ sources: [{ name: 'github_trending', display_name: 'GitHub Trending', category: 'code', url: 'https://github.com/trending' }] }));
    const days = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'];
    for (const day of days) write(day);

    const base = { sourceRoot: workspace, webRoot: web, sourcesConfig: sources, includePushed: false, date: '', apply: true };
    // windowDays 0 = no window: the pre-existing behaviour, and the escape
    // hatch if the rolling window ever needs to be turned off.
    const all = syncDailyInfo({ ...base, windowDays: 0 });
    assert.equal(all.added, 10, 'windowDays 0 writes every day');
    assert.equal(all.deleted, 0, 'windowDays 0 prunes nothing');

    // A new day arrives; the window is now the newest 7 days: 09-24 .. 09-30.
    write('2026-09-30');
    const windowed = syncDailyInfo({ ...base, windowDays: 7 });
    assert.equal(windowed.added, 1, 'only the new day is written');
    assert.equal(windowed.updated, 0, 'in-window days are unchanged');
    assert.equal(windowed.deleted, 8, 'four days x item + briefing fall out');
    for (const date of ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']) {
      assert.equal(existsSync(itemPath(date)), false, `pruned item ${date}`);
      assert.equal(existsSync(briefingPath(date)), false, `pruned briefing ${date}`);
    }
    for (const date of ['2026-09-24', '2026-09-30']) {
      assert.equal(existsSync(itemPath(date)), true, `kept item ${date}`);
      assert.equal(existsSync(briefingPath(date)), true, `kept briefing ${date}`);
    }
    assert.deepEqual(
      windowed.deleted_paths.filter((p) => p.startsWith('src/content/items/')).length, 4,
      'deleted_paths reports the pruned items',
    );
    passed += 1;

    // Idempotent: a second run over unchanged content prunes nothing further.
    const repeat = syncDailyInfo({ ...base, windowDays: 7 });
    assert.equal(repeat.deleted, 0, 'a settled window prunes nothing');
    assert.equal(repeat.added + repeat.updated, 0, 'and rewrites nothing');

    // Anchored to the newest CONTENT, not to today. Every date in this fixture
    // is in the past, and nothing new has arrived -- a wall-clock window would
    // compute a cutoff near the real today and delete the lot.
    const held = syncDailyInfo({ ...base, windowDays: 3 });
    assert.equal(held.cutoff, '2026-09-28', 'the cutoff follows the newest content, not the clock');
    assert.equal(held.deleted, 8, 'only what fell out of 3 days is pruned');
    for (const date of ['2026-09-28', '2026-09-29', '2026-09-30']) {
      assert.equal(existsSync(itemPath(date)), true, `the window still holds ${date}`);
    }
    passed += 1;
  } finally {
    rmSync(wroot, { recursive: true, force: true });
  }
}

// A Briefing the sync shares with another publisher must survive pruning with
// its other content intact -- only this publisher's marked section and its own
// item ids may be removed.
{
  const mroot = mkdtempSync(join(tmpdir(), 'dailyinfo-mixed-'));
  const workspace = join(mroot, 'workspace');
  const web = join(mroot, 'web');
  const sources = join(mroot, 'sources.json');
  try {
    mkdirSync(join(workspace, 'briefings', 'code'), { recursive: true });
    writeFileSync(sources, JSON.stringify({ sources: [{ name: 'github_trending', category: 'code', url: 'https://github.com/trending' }] }));
    writeFileSync(join(workspace, 'briefings', 'code', 'github_trending_briefing_2026-09-20.md'), '# GitHub Trending\n\n1. **Old** — summary.');
    writeFileSync(join(workspace, 'briefings', 'code', 'github_trending_briefing_2026-09-29.md'), '# GitHub Trending\n\n1. **New** — summary.');
    const base = { sourceRoot: workspace, webRoot: web, sourcesConfig: sources, includePushed: false, date: '', apply: true };
    syncDailyInfo({ ...base, windowDays: 0 });

    const mixed = join(web, 'src/content/briefings/generated/2026/09/20/code.md');
    const original = readFileSync(mixed, 'utf8');
    // `item_ids` is rendered as a block sequence, not a flow array.
    writeFileSync(mixed, original
      .replace(/^item_ids:\n/m, 'item_ids:\n  - "other-publisher-001"\n')
      .replace(/\n---\n/, '\n---\n\n### From another publisher\n\nKept verbatim.\n'));

    const pruned = syncDailyInfo({ ...base, windowDays: 7 });
    const text = readFileSync(mixed, 'utf8');
    assert.equal(existsSync(mixed), true, 'a shared briefing is not deleted');
    assert.doesNotMatch(text, /dailyinfo-sync:start/, 'the sync section is removed');
    assert.match(text, /From another publisher/, 'other content is untouched');
    assert.match(text, /other-publisher-001/, 'the other publisher\'s item id is kept');
    assert.doesNotMatch(text, /dailyinfo-code-github_trending-2026-09-20/, 'the pruned item id is dropped');
    assert.ok(pruned.deleted_paths.includes('src/content/briefings/generated/2026/09/20/code.md'), 'the rewrite is reported');
    passed += 1;
  } finally {
    rmSync(mroot, { recursive: true, force: true });
  }
}

console.log(`[dailyinfo-sync tests] ${passed}/${passed} passed`);
