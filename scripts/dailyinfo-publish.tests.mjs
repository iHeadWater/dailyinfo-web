import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = resolve(new URL('..', import.meta.url).pathname);
const root = mkdtempSync(join(tmpdir(), 'dailyinfo-publish-tests-'));
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
  cpSync(join(project, 'scripts/dailyinfo-publish.mjs'), join(repo, 'scripts/dailyinfo-publish.mjs'));
  cpSync(join(project, 'scripts/dailyinfo-sync.mjs'), join(repo, 'scripts/dailyinfo-sync.mjs'));
  symlinkSync(join(project, 'node_modules'), join(repo, 'node_modules'), 'dir');
  write(join(repo, 'package.json'), '{"type":"module"}\n');
  write(join(repo, '.gitignore'), 'runtime/\n');
  write(join(repo, 'src/content/items/generated/.gitkeep'), '');
  write(join(repo, 'src/content/briefings/generated/.gitkeep'), '');
  must(repo, 'git', ['add', '.']);
  must(repo, 'git', ['commit', '-m', 'initial']);
  must(repo, 'git', ['remote', 'add', 'origin', remote]);
  must(repo, 'git', ['push', '-u', 'origin', 'main']);
  write(join(workspace, 'briefings/code/github_trending_briefing_2026-09-28.md'), '# GitHub Trending\n\n1. **Example** — summary.');
  write(sources, JSON.stringify({ sources: [{ name: 'github_trending', category: 'code', url: 'https://github.com/trending' }] }));
  const npm = join(bin, 'npm');
  write(npm, '#!/bin/sh\nif [ -n "$TEST_NPM_TOUCH" ]; then touch "$TEST_NPM_TOUCH"; fi\nexit "${TEST_NPM_EXIT:-0}"\n');
  chmodSync(npm, 0o755);
  const env = {
    DAILYINFO_DATA_ROOT: workspace,
    DAILYINFO_SOURCES: sources,
    DAILYINFO_PUBLISH_BRANCH: 'main',
    DAILYINFO_PUBLISH_REMOTE: 'origin',
    DAILYINFO_PUBLISH_REMOTE_URL: remote,
    PATH: `${bin}:${process.env.PATH}`,
  };
  return { base, repo, remote, workspace, sources, env };
}

function publish(f, extraArgs = [], extraEnv = {}) {
  return command(f.repo, process.execPath, ['scripts/dailyinfo-publish.mjs', '--date', '2026-09-28', '--publish', ...extraArgs], { ...f.env, ...extraEnv });
}

try {
  {
    const f = fixture('success');
    const result = publish(f);
    assert.equal(result.status, 0, result.stderr);
    assert.match(must(f.repo, 'git', ['log', '-1', '--format=%s']), /publish\(dailyinfo\)/);
    assert.equal(must(f.repo, 'git', ['rev-parse', 'HEAD']), must(f.repo, 'git', ['rev-parse', 'origin/main']));
    const publicationReport = JSON.parse(report(f));
    assert.equal(publicationReport.git.commit_created, true);
    assert.equal(publicationReport.git.remote_head_after, publicationReport.git.head_after);
    passed += 1;
  }
  {
    const f = fixture('dirty');
    write(join(f.repo, 'unrelated.txt'), 'do not publish');
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.match(report(f), /clean worktree/);
    assert.equal(existsSync(join(f.repo, 'src/content/items/generated/code/dailyinfo-code-github_trending-2026-09-28.md')), false);
    passed += 1;
  }
  {
    const f = fixture('branch');
    must(f.repo, 'git', ['switch', '-c', 'feature']);
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.match(report(f), /expected main/);
    passed += 1;
  }
  {
    const f = fixture('remote-ahead');
    const other = join(f.base, 'other');
    must(f.base, 'git', ['clone', f.remote, other]);
    must(other, 'git', ['config', 'user.name', 'Remote Writer']);
    must(other, 'git', ['config', 'user.email', 'remote@example.test']);
    write(join(other, 'remote-change.txt'), 'new');
    must(other, 'git', ['add', '.']);
    must(other, 'git', ['commit', '-m', 'remote advance']);
    must(other, 'git', ['push', 'origin', 'main']);
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.match(report(f), /not an ancestor/);
    passed += 1;
  }
  {
    const f = fixture('lock');
    const lock = join(f.repo, 'runtime/dailyinfo-sync/.publish.lock');
    mkdirSync(lock, { recursive: true });
    write(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, hostname: hostname(), started_at: '2000-01-01T00:00:00.000Z' }));
    const result = publish(f);
    assert.notEqual(result.status, 0);
    assert.match(report(f), /another publication/);
    passed += 1;
  }
  {
    const f = fixture('stale-lock');
    const lock = join(f.repo, 'runtime/dailyinfo-sync/.publish.lock');
    mkdirSync(lock, { recursive: true });
    write(join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647, hostname: hostname(), started_at: '2000-01-01T00:00:00.000Z' }));
    const result = publish(f, [], { DAILYINFO_PUBLISH_LOCK_STALE_MS: '0' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(lock), false);
    passed += 1;
  }
  {
    const f = fixture('gate-failure');
    const result = publish(f, [], { TEST_NPM_EXIT: '1' });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(f.repo, 'src/content/items/generated/code/dailyinfo-code-github_trending-2026-09-28.md')), false);
    assert.equal(must(f.repo, 'git', ['status', '--porcelain']), '');
    assert.match(report(f), /restored from pre-run snapshot/);
    passed += 1;
  }
  {
    const f = fixture('push-retry');
    const hook = join(f.remote, 'hooks/pre-receive');
    write(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    const failed = publish(f);
    assert.notEqual(failed.status, 0);
    const retained = must(f.repo, 'git', ['rev-parse', 'HEAD']);
    assert.notEqual(retained, must(f.repo, 'git', ['rev-parse', 'origin/main']));
    assert.equal(must(f.repo, 'git', ['status', '--porcelain']), '');
    assert.match(report(f), /retained for safe push retry/);
    assert.equal(JSON.parse(report(f)).build_success, true);
    write(hook, '#!/bin/sh\nexit 0\n');
    const retried = publish(f);
    assert.equal(retried.status, 0, retried.stderr);
    assert.equal(must(f.repo, 'git', ['rev-parse', 'HEAD']), must(f.repo, 'git', ['rev-parse', 'origin/main']));
    passed += 1;
  }
  {
    const f = fixture('local-only');
    const result = command(f.repo, process.execPath, ['scripts/dailyinfo-publish.mjs', '--date', '2026-09-28'], f.env);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(f.repo, 'src/content/items/generated/code/dailyinfo-code-github_trending-2026-09-28.md')), true);
    assert.equal(must(f.repo, 'git', ['log', '-1', '--format=%s']), 'initial');
    const publicationReport = JSON.parse(report(f));
    assert.equal(publicationReport.publish_success, false);
    assert.equal(publicationReport.build_success, true);
    passed += 1;
  }
  {
    const f = fixture('wrong-remote');
    const result = publish(f, [], { DAILYINFO_PUBLISH_REMOTE_URL: `${f.remote}-wrong` });
    assert.notEqual(result.status, 0);
    assert.match(report(f), /unexpected origin push URL/);
    passed += 1;
  }
  {
    const f = fixture('unexpected-change');
    const surprise = join(f.repo, 'surprise.txt');
    const result = publish(f, [], { TEST_NPM_TOUCH: surprise });
    assert.notEqual(result.status, 0);
    assert.match(report(f), /outside this sync run/);
    assert.equal(existsSync(join(f.repo, 'src/content/items/generated/code/dailyinfo-code-github_trending-2026-09-28.md')), false);
    passed += 1;
  }
  {
    // A retention window has to reach the remote as DELETIONS, not merely as
    // new content -- otherwise the site keeps every day it has ever shown and
    // "the last week" is a claim only the writer believes.
    const f = fixture('window');
    for (const day of ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']) {
      write(join(f.workspace, 'briefings/code', `github_trending_briefing_${day}.md`), `# GitHub Trending\n\n1. **${day}** — summary.`);
    }
    const atRemote = (path) => command(f.repo, 'git', ['cat-file', '-e', `origin/main:${path}`]).status === 0;
    const oldItem = 'src/content/items/generated/code/dailyinfo-code-github_trending-2026-09-20.md';
    const oldBriefing = 'src/content/briefings/generated/2026/09/20/code.md';
    const keptItem = 'src/content/items/generated/code/dailyinfo-code-github_trending-2026-09-28.md';

    // No --window-days: the pre-existing behaviour, every date retained.
    const wide = command(f.repo, process.execPath, ['scripts/dailyinfo-publish.mjs', '--publish'], f.env);
    assert.equal(wide.status, 0, wide.stderr);
    assert.equal(atRemote(oldItem), true, 'without a window everything is published');
    assert.equal(atRemote(oldBriefing), true);

    // Newest content is 2026-09-28, so a 7-day window covers 09-22 .. 09-28.
    const narrow = command(f.repo, process.execPath, ['scripts/dailyinfo-publish.mjs', '--publish', '--window-days', '7'], f.env);
    assert.equal(narrow.status, 0, narrow.stderr);
    assert.equal(atRemote(oldItem), false, 'the pruned item is deleted from the remote');
    assert.equal(atRemote(oldBriefing), false, 'and so is its briefing');
    assert.equal(atRemote(keptItem), true, 'in-window content survives');
    assert.equal(must(f.repo, 'git', ['status', '--porcelain']), '', 'the worktree is left clean');
    assert.equal(must(f.repo, 'git', ['rev-parse', 'HEAD']), must(f.repo, 'git', ['rev-parse', 'origin/main']));
    passed += 1;
  }
  console.log(`[dailyinfo-publish tests] ${passed}/${passed} passed`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
