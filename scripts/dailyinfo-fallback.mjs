#!/usr/bin/env node
/**
 * Catch-up publication: run after the scheduled window to recover a day the
 * primary run missed.
 *
 * It inspects first and publishes only when something is actually pending, so
 * the ordinary case is a no-op. `--include-pushed` widens the scan to the
 * `pushed/` archive, because the Discord step MOVES briefing files there —
 * by the time a fallback runs, `briefings/` is usually empty.
 *
 * Arguments are forwarded to scripts/dailyinfo-publish.mjs, so a caller can
 * pass `--window-days 7` and have the catch-up honour the same retention
 * policy as the scheduled run.
 *
 * See scripts/dailyinfo-fallback.tests.mjs for the pinned contract.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repo = resolve(process.cwd());
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const workspace = process.env.DAILYINFO_WORKSPACE || process.env.DAILYINFO_DATA_ROOT;
const sources = process.env.DAILYINFO_SOURCES;

if (!workspace) throw new Error('set DAILYINFO_DATA_ROOT or DAILYINFO_WORKSPACE');
if (!sources) throw new Error('set DAILYINFO_SOURCES to dailyinfo/config/sources.json');

const inspect = spawnSync(process.execPath, [
  'scripts/dailyinfo-sync.mjs', '--include-pushed', '--date', date,
  '--source-root', workspace, '--sources', sources,
], { cwd: repo, encoding: 'utf8' });

if (inspect.status !== 0) {
  process.stderr.write(inspect.stderr || 'DailyInfo fallback inspection failed.\n');
  process.exit(inspect.status || 1);
}

const result = JSON.parse(inspect.stdout);
const pending = result.added + result.updated;
if (pending === 0) {
  console.log(`[dailyinfo-fallback] ${date}: no missed content; nothing to do`);
  process.exit(0);
}

console.log(`[dailyinfo-fallback] ${date}: found ${pending} missed item(s); running guarded publication`);
const publish = spawnSync(process.execPath, [
  'scripts/dailyinfo-publish.mjs', '--include-pushed', '--date', date,
  // --publish is the whole point of this script. Without it the publisher
  // syncs and gates the content, reports success, and commits and pushes
  // NOTHING -- leaving the synced files sitting in the worktree, which the
  // clean-worktree preflight then rejects on every later scheduled run.
  '--publish',
  // Forwarded so the fallback publishes under the same retention policy as the
  // scheduled run (e.g. `--window-days 7`). Without it a catch-up run would
  // reintroduce content the window had already dropped.
  ...process.argv.slice(2),
], { cwd: repo, stdio: 'inherit' });
process.exit(publish.status || 0);
