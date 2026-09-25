#!/usr/bin/env node
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
], { cwd: repo, stdio: 'inherit' });
process.exit(publish.status || 0);
