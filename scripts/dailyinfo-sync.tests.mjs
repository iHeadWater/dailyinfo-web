import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncDailyInfo } from './dailyinfo-sync.mjs';

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
  assert.match(briefingPath, /2026\/09\/26\/code\.md$/);

  const second = syncDailyInfo(options);
  assert.equal(second.added, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 1);
  assert.equal(second.briefings_written, 0);
  assert.equal(readFileSync(itemPath, 'utf8'), firstItem);
  assert.equal(readFileSync(briefingPath, 'utf8'), firstBriefing);

  writeFileSync(join(workspace, 'briefings', 'code', 'github_trending_briefing_2026-09-26.md'), '# GitHub Trending\n\n1. **Example** — updated summary.');
  const third = syncDailyInfo(options);
  assert.equal(third.updated, 1);
  assert.equal(third.added, 0);
  assert.equal((readFileSync(briefingPath, 'utf8').match(/dailyinfo-sync:start/g) || []).length, 1);
  console.log('[dailyinfo-sync tests] 3/3 passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
