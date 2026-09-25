#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  snapshot();
  const syncArgs = ['scripts/dailyinfo-sync.mjs', '--apply', '--source-root', workspace, '--sources', sources];
  if (includePushed) syncArgs.push('--include-pushed');
  if (requestedDate) syncArgs.push('--date', requestedDate);
  const sync = run('sync', process.execPath, syncArgs, { capture: true });
  report.sync = JSON.parse(sync.stdout);
  for (const gate of ['validate', 'test', 'check', 'build']) run(`npm:${gate}`, 'npm', ['run', gate]);
  report.build_success = true;

  if (publish) {
    const branch = run('git:branch', 'git', ['branch', '--show-current'], { capture: true }).stdout.trim();
    run('git:add', 'git', ['add', 'src/content/items/generated', 'src/content/briefings/generated']);
    const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: repo });
    if (diff.status !== 0) run('git:commit', 'git', ['commit', '-m', `publish(dailyinfo): ${requestedDate || date}`]);
    run('git:push', 'git', ['push', 'origin', branch]);
    run('pages:dispatch', 'gh', ['workflow', 'run', 'deploy.yml', '--ref', branch]);
    report.publish_success = true;
  } else {
    report.publish_success = false;
    report.publish_skipped = 'run with --publish after repository write access is available';
  }
  report.status = 'success';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  report.build_success = false;
  if (!report.steps.some((step) => step.name === 'git:commit')) {
    restore();
    report.rollback = 'generated content restored from pre-run snapshot';
  } else {
    report.rollback = 'valid committed content retained for publish retry';
  }
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  saveReport();
  rmSync(backup, { recursive: true, force: true });
  console.log(`\nDailyInfo publication log: ${logPath}`);
}
