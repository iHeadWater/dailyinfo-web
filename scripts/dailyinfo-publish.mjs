#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(process.cwd());
const runtime = join(repo, 'runtime/dailyinfo-sync');
mkdirSync(runtime, { recursive: true });
const localNow = new Date();
const date = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
const logPath = join(runtime, `${date}.json`);
const args = process.argv.slice(2);
const publish = args.includes('--publish');
const includePushed = args.includes('--include-pushed');
const requestedDate = args.includes('--date') ? args[args.indexOf('--date') + 1] : '';
const workspace = process.env.DAILYINFO_WORKSPACE || process.env.DAILYINFO_DATA_ROOT;
const sources = process.env.DAILYINFO_SOURCES;
const backup = mkdtempSync(join(tmpdir(), 'dailyinfo-web-backup-'));
const contentPaths = ['src/content/items/generated', 'src/content/briefings/generated'];
const report = { started_at: new Date().toISOString(), date: requestedDate || date, status: 'running', publish_requested: publish, steps: [] };
const expectedBranch = process.env.DAILYINFO_PUBLISH_BRANCH || 'main';
const remote = process.env.DAILYINFO_PUBLISH_REMOTE || 'origin';
const expectedRemoteUrl = process.env.DAILYINFO_PUBLISH_REMOTE_URL || 'https://github.com/iHeadWater/dailyinfo-web.git';
const lockPath = join(runtime, '.publish.lock');
const lockStaleMs = Number(process.env.DAILYINFO_PUBLISH_LOCK_STALE_MS || 6 * 60 * 60 * 1000);
let lockHeld = false;
let snapshotTaken = false;
let commitCreated = false;

if (!workspace) throw new Error('set DAILYINFO_DATA_ROOT or DAILYINFO_WORKSPACE');
if (!sources) throw new Error('set DAILYINFO_SOURCES to dailyinfo/config/sources.json');

function saveReport() {
  const temp = `${logPath}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  renameSync(temp, logPath);
}

function run(name, command, commandArgs, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, { cwd: repo, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit' });
  report.steps.push({ name, success: result.status === 0, duration_ms: Date.now() - started, exit_code: result.status, stdout: options.capture ? result.stdout?.trim() : undefined, stderr: options.capture ? result.stderr?.trim() : undefined });
  saveReport();
  if (result.status !== 0) throw new Error(`${name} failed with exit code ${result.status}`);
  return result;
}

function git(name, commandArgs, options = {}) {
  return run(`git:${name}`, 'git', commandArgs, options);
}

function normalizedRemoteUrl(value) {
  return value.trim().replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
}

function acquireLock() {
  const owner = { pid: process.pid, hostname: hostname(), started_at: report.started_at };
  const create = () => {
    mkdirSync(lockPath);
    writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify(owner)}\n`);
    lockHeld = true;
  };
  try {
    create();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing;
    try {
      existing = JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8'));
    } catch {
      throw new Error(`publication lock has unreadable owner metadata; remove it manually after verifying no run is active: ${lockPath}`);
    }
    const age = Date.now() - Date.parse(existing.started_at);
    let alive = true;
    if (existing.hostname === hostname() && Number.isInteger(existing.pid)) {
      try { process.kill(existing.pid, 0); } catch (killError) { alive = killError.code === 'EPERM'; }
    }
    if (existing.hostname !== hostname() || alive || !Number.isFinite(age) || age < lockStaleMs) {
      throw new Error(`another publication is running (lock owner: ${JSON.stringify(existing)})`);
    }
    const stalePath = `${lockPath}.stale-${process.pid}-${Date.now()}`;
    try { renameSync(lockPath, stalePath); } catch (renameError) {
      if (renameError.code === 'ENOENT') throw new Error(`publication lock changed during stale-lock recovery: ${lockPath}`);
      throw renameError;
    }
    try { create(); } catch (retryError) {
      if (retryError.code === 'EEXIST') throw new Error(`another publication acquired the lock during stale-lock recovery: ${lockPath}`);
      throw retryError;
    } finally {
      rmSync(stalePath, { recursive: true, force: true });
    }
  }
}

function releaseLock() {
  if (lockHeld) rmSync(lockPath, { recursive: true, force: true });
}

function publishPreflight() {
  const root = git('root', ['rev-parse', '--show-toplevel'], { capture: true }).stdout.trim();
  if (resolve(root) !== repo) throw new Error(`run publisher from repository root: ${root}`);
  const status = git('status', ['status', '--porcelain=v1', '--untracked-files=all'], { capture: true }).stdout.trim();
  if (status) throw new Error(`publish requires a clean worktree before sync:\n${status}`);
  const branch = git('branch', ['branch', '--show-current'], { capture: true }).stdout.trim();
  if (branch !== expectedBranch) throw new Error(`refusing to publish branch ${branch || '(detached)'}; expected ${expectedBranch}`);
  const actualRemoteUrl = git('remote-url', ['remote', 'get-url', '--push', remote], { capture: true }).stdout.trim();
  if (normalizedRemoteUrl(actualRemoteUrl) !== normalizedRemoteUrl(expectedRemoteUrl)) {
    throw new Error(`refusing unexpected ${remote} push URL: ${actualRemoteUrl}`);
  }
  git('fetch', ['fetch', '--no-tags', remote, expectedBranch]);
  const remoteRef = `refs/remotes/${remote}/${expectedBranch}`;
  const remoteHead = git('remote-head', ['rev-parse', remoteRef], { capture: true }).stdout.trim();
  const localHead = git('local-head', ['rev-parse', 'HEAD'], { capture: true }).stdout.trim();
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', remoteRef, 'HEAD'], { cwd: repo });
  if (ancestor.status !== 0) throw new Error(`${remote}/${expectedBranch} is not an ancestor of local HEAD; fetch/rebase before publishing`);
  const ahead = git('ahead', ['rev-list', `${remoteRef}..HEAD`], { capture: true }).stdout.split('\n').filter(Boolean);
  for (const commit of ahead) {
    const subject = git('ahead-subject', ['show', '-s', '--format=%s', commit], { capture: true }).stdout.trim();
    const paths = git('ahead-paths', ['diff-tree', '--no-commit-id', '--name-only', '-r', commit], { capture: true }).stdout.split('\n').filter(Boolean);
    const safePaths = paths.every((path) => contentPaths.some((rootPath) => path.startsWith(`${rootPath}/`)));
    if (!subject.startsWith('publish(dailyinfo): ') || !safePaths) {
      throw new Error(`local HEAD contains non-publication commit not present on ${remote}/${expectedBranch}: ${commit}`);
    }
  }
  report.git = { branch, remote, remote_url: actualRemoteUrl, head_before: localHead, remote_head_before: remoteHead };
  saveReport();
}

function assertOnlySyncChanges(writtenPaths) {
  const allowed = new Set(writtenPaths);
  const changed = git('changed-paths', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { capture: true }).stdout
    .split('\0').filter(Boolean).map((line) => line.slice(3));
  const unexpected = changed.filter((path) => !allowed.has(path));
  if (unexpected.length) throw new Error(`refusing changes outside this sync run:\n${unexpected.join('\n')}`);
  return changed;
}

function snapshot() {
  for (const path of contentPaths) if (existsSync(join(repo, path))) cpSync(join(repo, path), join(backup, path), { recursive: true });
}

function restore() {
  for (const path of contentPaths) {
    rmSync(join(repo, path), { recursive: true, force: true });
    if (existsSync(join(backup, path))) cpSync(join(backup, path), join(repo, path), { recursive: true });
  }
}

try {
  acquireLock();
  if (publish) publishPreflight();
  snapshot();
  snapshotTaken = true;
  const syncArgs = ['scripts/dailyinfo-sync.mjs', '--apply', '--source-root', workspace, '--sources', sources];
  if (includePushed) syncArgs.push('--include-pushed');
  if (requestedDate) syncArgs.push('--date', requestedDate);
  const sync = run('sync', process.execPath, syncArgs, { capture: true });
  report.sync = JSON.parse(sync.stdout);
  for (const gate of ['validate', 'test', 'check', 'build']) run(`npm:${gate}`, 'npm', ['run', gate]);
  report.build_success = true;

  if (publish) {
    const writtenPaths = report.sync.written_paths || [];
    const changedPaths = assertOnlySyncChanges(writtenPaths);
    if (changedPaths.length) git('add', ['add', '--', ...changedPaths]);
    const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: repo });
    if (diff.status !== 0) {
      git('commit', ['commit', '-m', `publish(dailyinfo): ${requestedDate || date}`]);
      commitCreated = true;
    }
    const headAfter = git('head-after', ['rev-parse', 'HEAD'], { capture: true }).stdout.trim();
    report.git.head_after = headAfter;
    report.git.commit_created = commitCreated;
    git('push', ['push', remote, `HEAD:${expectedBranch}`]);
    report.git.remote_head_after = headAfter;
    report.publish_success = true;
  } else {
    report.publish_success = false;
    report.publish_skipped = 'run with --publish after repository write access is available';
  }
  report.status = 'success';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  if (report.build_success !== true) report.build_success = false;
  if (snapshotTaken && !commitCreated) {
    restore();
    report.rollback = 'generated content restored from pre-run snapshot';
  } else if (commitCreated) {
    report.rollback = 'valid local commit retained for safe push retry';
  }
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  saveReport();
  rmSync(backup, { recursive: true, force: true });
  releaseLock();
  console.log(`\nDailyInfo publication log: ${logPath}`);
}
