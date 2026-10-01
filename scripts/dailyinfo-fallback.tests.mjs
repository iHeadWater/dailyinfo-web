import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * The fallback is the catch-up path: when the scheduled publication misses a
 * day, this is what recovers it. Two properties are pinned here, and the first
 * is the one that was wrong -- a fallback that reports success without
 * publishing leaves uncommitted content in the worktree, and the guard on the
 * NEXT scheduled run then refuses to start until someone cleans up by hand.
 */
const project = resolve(new URL('..', import.meta.url).pathname);
const root = mkdtempSync(join(tmpdir(), 'dailyinfo-fallback-tests-'));
let passed = 0;

function command(cwd, commandName, args, env = {}) {
  return spawnSync(commandName, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

function must(cwd, commandName, args, env = {}) {
  const result = command(cwd, commandName, args, env);
  assert.equal(result.status, 0, `${commandName} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function report(f) {
  const runtime = join(f.repo, 'runtime/dailyinfo-sync');
  const reports = readdirSync(runtime).filter((name) => name.endsWith('.json'));
  assert.equal(reports.length, 1, `expected one publication report, found ${reports.length}`);
  return readFileSync(join(runtime, reports[0]), 'utf8');
}

function fixture(name) {
  const base = join(root, name);
  const repo = join(base, 'web');
  const remote = join(base, 'remote.git');
  const workspace = join(base, 'dailyinfo');
  const sources = join(base, 'sources.json');
  const bin = join(base, 'bin');
  mkdirSync(repo, { recursive: true });
  mkdirSync(bin, { recursive: true });
  must(base, 'git', ['init', '--bare', '-b', 'main', remote]);
  must(repo, 'git', ['init', '-b', 'main']);
  must(repo, 'git', ['config', 'user.name', 'Publisher Test']);
  must(repo, 'git', ['config', 'user.email', 'publisher@example.test']);
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  // The fallback shells out to the publisher, which shells out to the sync:
  // all three have to be present for the path to run end to end.
  for (const script of ['dailyinfo-publish.mjs', 'dailyinfo-sync.mjs', 'dailyinfo-fallback.mjs']) {
    cpSync(join(project, 'scripts', script), join(repo, 'scripts', script));
  }
  symlinkSync(join(project, 'node_modules'), join(repo, 'node_modules'), 'dir');
  write(join(repo, 'package.json'), '{"type":"module"}\n');
  write(join(repo, '.gitignore'), 'runtime/\n');
  write(join(repo, 'src/content/items/generated/.gitkeep'), '');
  write(join(repo, 'src/content/briefings/generated/.gitkeep'), '');
  must(repo, 'git', ['add', '.']);
  must(repo, 'git', ['commit', '-m', 'initial']);
  must(repo, 'git', ['remote', 'add', 'origin', remote]);
  must(repo, 'git', ['push', '-u', 'origin', 'main']);

  // The fallback derives its date from the wall clock, so the missed content
  // has to be dated today or its `--date` filter skips it.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  write(join(workspace, `briefings/code/github_trending_briefing_${today}.md`), '# GitHub Trending\n\n1. **Missed** — summary.');
  write(sources, JSON.stringify({ sources: [{ name: 'github_trending', category: 'code', url: 'https://github.com/trending' }] }));

  const npm = join(bin, 'npm');
  write(npm, '#!/bin/sh\nexit 0\n');
  chmodSync(npm, 0o755);
  return {
    repo,
    workspace,
    today,
    itemPath: `src/content/items/generated/code/dailyinfo-code-github_trending-${today}.md`,
    env: {
      DAILYINFO_DATA_ROOT: workspace,
      DAILYINFO_SOURCES: sources,
      DAILYINFO_PUBLISH_BRANCH: 'main',
      DAILYINFO_PUBLISH_REMOTE: 'origin',
      DAILYINFO_PUBLISH_REMOTE_URL: remote,
      PATH: `${bin}:${process.env.PATH}`,
    },
  };
}

try {
  {
    const f = fixture('recovers');
    const before = must(f.repo, 'git', ['rev-parse', 'HEAD']);
    const result = command(f.repo, process.execPath, ['scripts/dailyinfo-fallback.mjs'], f.env);
    assert.equal(result.status, 0, result.stderr);
    // The defect this file exists for: the fallback used to run the publisher
    // WITHOUT --publish, so it exited 0 having committed and pushed nothing.
    assert.notEqual(must(f.repo, 'git', ['rev-parse', 'HEAD']), before, 'the fallback commits');
    assert.equal(must(f.repo, 'git', ['rev-parse', 'HEAD']), must(f.repo, 'git', ['rev-parse', 'origin/main']), 'and pushes');
    assert.match(must(f.repo, 'git', ['log', '-1', '--format=%s']), /publish\(dailyinfo\)/);
    assert.match(report(f), /"publish_success": true/);
    passed += 1;

    // The original bug's second face: content left uncommitted blocks the next
    // guarded run, which is how one missed day used to freeze every later one.
    assert.equal(must(f.repo, 'git', ['status', '--porcelain']), '', 'no uncommitted content is left behind');
    const scheduled = command(f.repo, process.execPath, ['scripts/dailyinfo-publish.mjs', '--include-pushed', '--publish'], f.env);
    assert.equal(scheduled.status, 0, `a scheduled run still starts:\n${scheduled.stderr}`);
    passed += 1;
  }
  {
    const f = fixture('nothing-pending');
    // Publish today's content first, so the fallback has nothing to recover.
    const seed = command(f.repo, process.execPath, ['scripts/dailyinfo-publish.mjs', '--include-pushed', '--date', f.today, '--publish'], f.env);
    assert.equal(seed.status, 0, seed.stderr);
    const head = must(f.repo, 'git', ['rev-parse', 'HEAD']);
    const reportAfterSeed = report(f);

    const result = command(f.repo, process.execPath, ['scripts/dailyinfo-fallback.mjs'], f.env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no missed content/, 'and says so');
    assert.equal(must(f.repo, 'git', ['rev-parse', 'HEAD']), head, 'nothing is committed');
    assert.equal(must(f.repo, 'git', ['status', '--porcelain']), '', 'and nothing is written');
    // The publisher rewrites its report on every run, so an unchanged report is
    // what proves the fallback did not quietly start one.
    assert.equal(report(f), reportAfterSeed, 'no publication run happened');
    passed += 1;
  }
  console.log(`[dailyinfo-fallback tests] ${passed}/${passed} passed`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
