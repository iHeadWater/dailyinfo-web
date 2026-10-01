#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const CATEGORIES = new Set(['papers', 'ai_news', 'code', 'resource', 'arxiv']);
const FILE_RE = /^(.+)_briefing_(\d{4}-\d{2}-\d{2})(.*)\.md$/;
const START = '<!-- dailyinfo-sync:start -->';
const END = '<!-- dailyinfo-sync:end -->';

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, content, 'utf8');
  renameSync(temp, path);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'entry';
}

function quotedYaml(data) {
  return stringifyYaml(data, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' }).trimEnd();
}

function parseDocument(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error('expected YAML frontmatter');
  return { data: parseYaml(match[1]), body: match[2] };
}

function renderDocument(data, body = '') {
  return `---\n${quotedYaml(data)}\n---\n${body.replace(/^\n+/, '')}`;
}

function firstHeading(markdown, fallback) {
  const match = markdown.match(/^#{1,3}\s+(.+)$/m);
  return match?.[1]?.trim() || fallback;
}

function sourceSummary(markdown) {
  return markdown.replace(/^#{1,3}\s+.*\n+/, '').trim() || '当日无新内容。';
}

function reportedEntryCount(markdown) {
  const match = markdown.match(/-\s*(\d+)\s*篇文章/);
  return match ? Number(match[1]) : null;
}

function timestampFor(date) {
  return `${date}T00:00:00+08:00`;
}

/**
 * Shift a YYYY-MM-DD date by whole days.
 *
 * Arithmetic runs in UTC on purpose: a local-time implementation would give a
 * different cutoff on a machine in another timezone, and the publisher compares
 * these strings against dates parsed out of filenames.
 */
function shiftDate(date, days) {
  const base = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  const shifted = new Date(base + days * 86_400_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** Item filenames this publisher owns: `dailyinfo-…-YYYY-MM-DD.md`. */
const ITEM_FILE_RE = /^dailyinfo-.*-(\d{4}-\d{2}-\d{2})\.md$/;

function loadSources(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  return new Map(config.sources.map((source) => [source.name, source]));
}

function listMarkdown(root, includePushed) {
  const bases = [join(root, 'briefings')];
  if (includePushed) bases.push(join(root, 'pushed'));
  const files = [];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const category of readdirSync(base, { withFileTypes: true })) {
      if (!category.isDirectory() || !CATEGORIES.has(category.name)) continue;
      for (const name of readdirSync(join(base, category.name))) {
        if (name.endsWith('.md')) files.push({ path: join(base, category.name, name), category: category.name });
      }
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Publisher-owned Item files that fell out of the retention window.
 *
 * Matched on the `dailyinfo-…-{date}.md` shape this sync writes, so a file some
 * other publisher placed in the same directory is never a candidate — the web
 * repository is shared, and pruning must stay inside its own boundary.
 */
function expiredItemFiles(webRoot, cutoff) {
  const base = join(webRoot, 'src/content/items/generated');
  const expired = [];
  if (!existsSync(base)) return expired;
  for (const category of readdirSync(base, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    for (const name of readdirSync(join(base, category.name))) {
      const match = name.match(ITEM_FILE_RE);
      if (match && match[1] < cutoff) expired.push(join(base, category.name, name));
    }
  }
  return expired.sort();
}

/** Briefing files dated before the cutoff — the date is the directory path. */
function expiredBriefingFiles(webRoot, cutoff) {
  const base = join(webRoot, 'src/content/briefings/generated');
  const expired = [];
  if (!existsSync(base)) return expired;
  for (const year of readdirSync(base, { withFileTypes: true })) {
    if (!year.isDirectory()) continue;
    for (const month of readdirSync(join(base, year.name), { withFileTypes: true })) {
      if (!month.isDirectory()) continue;
      for (const day of readdirSync(join(base, year.name, month.name), { withFileTypes: true })) {
        if (!day.isDirectory()) continue;
        const date = `${year.name}-${month.name}-${day.name}`;
        if (date >= cutoff) continue;
        const dir = join(base, year.name, month.name, day.name);
        for (const name of readdirSync(dir)) {
          if (name.endsWith('.md')) expired.push(join(dir, name));
        }
      }
    }
  }
  return expired.sort();
}

/**
 * Remove this publisher's contribution from an expired Briefing.
 *
 * A Briefing is shared: the sync owns only the region between its own markers
 * and only the item ids it minted. Both are removed, and the file is deleted
 * only once nothing else is left — otherwise the other publisher's content is
 * rewritten verbatim around it.
 *
 * Returns 'deleted' | 'rewritten' | 'untouched'.
 */
function pruneBriefing(path, prunedItemIds) {
  const { data, body } = parseDocument(readFileSync(path, 'utf8'));
  const marked = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
  // No markers: this file was not written by the sync. Leave it alone.
  if (!marked.test(body)) return 'untouched';

  const remaining = body.replace(marked, '').trim();
  const itemIds = (data.item_ids || []).filter((id) => !prunedItemIds.has(id));
  if (!remaining && itemIds.length === 0) {
    rmSync(path, { force: true });
    return 'deleted';
  }
  atomicWrite(path, renderDocument({ ...data, item_ids: itemIds }, remaining));
  return 'rewritten';
}

export function syncDailyInfo(options) {
  const sourceRoot = resolve(options.sourceRoot);
  const webRoot = resolve(options.webRoot);
  const sources = loadSources(resolve(options.sourcesConfig));
  const discovered = listMarkdown(sourceRoot, options.includePushed);
  const records = [];
  const skipped = [];

  // Pass 1 resolves every candidate's date without reading it, so the retention
  // window can be anchored to the newest content the source actually holds.
  // Anchoring to the wall clock instead would let a collection outage slide the
  // window forward and empty a public site.
  const candidates = [];
  for (const file of discovered) {
    const name = basename(file.path);
    const match = name.match(FILE_RE);
    if (!match) { skipped.push({ file: file.path, reason: 'filename' }); continue; }
    const [, sourceName, date, suffix] = match;
    const source = sources.get(sourceName);
    if (!source?.url) { skipped.push({ file: file.path, reason: 'unknown-source' }); continue; }
    candidates.push({ file, sourceName, date, suffix, source });
  }

  const newestDate = candidates.reduce((newest, candidate) => (candidate.date > newest ? candidate.date : newest), '');
  // windowDays 0 (or absent) disables retention entirely: every date is kept.
  const cutoff = options.windowDays > 0 && newestDate ? shiftDate(newestDate, -(options.windowDays - 1)) : '';

  for (const candidate of candidates) {
    const { file, sourceName, date, suffix, source } = candidate;
    if (options.date && date !== options.date) continue;
    if (cutoff && date < cutoff) continue;
    const markdown = readFileSync(file.path, 'utf8').trim();
    const sourceKey = `${sourceName}${suffix}`;
    // Mirrors the backend registry default (display_name, falling back to name)
    // so both publication paths emit the same field with the same value. `||`,
    // not `??`: an empty configured display name must also fall back.
    const displayName = source.display_name || sourceName;
    records.push({
      category: file.category,
      date,
      sourceName,
      sourceUrl: source.url,
      sourceKey,
      displayName,
      markdown,
      reportedEntries: reportedEntryCount(markdown),
      id: `dailyinfo-${slug(file.category)}-${slug(sourceKey)}-${date}`,
      title: firstHeading(markdown, `${displayName} · ${date}`),
    });
  }

  const groups = new Map();
  for (const record of records) {
    const key = `${record.category}:${record.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let briefings = 0;
  const writes = new Map();
  const changedPaths = new Set();

  for (const record of records) {
    const briefingId = `${record.category}-${record.date}`;
    const data = {
      schema_version: 1,
      id: record.id,
      category: record.category,
      title: record.title,
      source: {
        name: record.sourceName,
        display_name: record.displayName,
        url: record.sourceUrl,
        external_id: record.sourceKey,
      },
      authors: [],
      source_published_at: null,
      retrieved_at: timestampFor(record.date),
      published_at: timestampFor(record.date),
      summary: sourceSummary(record.markdown),
      why_it_matters: null,
      tags: [],
      language: 'zh-CN',
      briefing_ids: [briefingId],
    };
    const target = join(webRoot, 'src/content/items/generated', record.category, `${record.id}.md`);
    const rendered = renderDocument(data);
    if (!existsSync(target)) { added += 1; changedPaths.add(target); }
    else if (readFileSync(target, 'utf8') === rendered) unchanged += 1;
    else { updated += 1; changedPaths.add(target); }
    writes.set(target, rendered);
  }

  for (const [key, group] of groups) {
    const [category, date] = key.split(':');
    const [year, month, day] = date.split('-');
    const target = join(webRoot, 'src/content/briefings/generated', year, month, day, `${category}.md`);
    const itemIds = group.map((record) => record.id).sort();
    const section = `${START}\n${group.map((record) => `## ${record.title}\n\n${record.markdown}`).join('\n\n---\n\n')}\n${END}\n`;
    let data;
    let body = '';
    if (existsSync(target)) {
      ({ data, body } = parseDocument(readFileSync(target, 'utf8')));
      const oldCategory = data.category;
      if (oldCategory !== category || data.id !== `${category}-${date}`) throw new Error(`briefing identity conflict: ${target}`);
      data.item_ids = [...new Set([...(data.item_ids || []), ...itemIds])].sort();
      const marked = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
      body = marked.test(body) ? body.replace(marked, section) : `${body.trimEnd()}\n\n${section}`;
    } else {
      const timestamp = timestampFor(date);
      data = { schema_version: 1, id: `${category}-${date}`, category, date, title: `DailyInfo ${category} briefing`, generated_at: timestamp, published_at: timestamp, item_ids: itemIds };
      body = section;
    }
    const rendered = renderDocument(data, body);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== rendered) {
      briefings += 1;
      changedPaths.add(target);
    }
    writes.set(target, rendered);
  }

  if (options.apply) for (const [path, content] of writes) atomicWrite(path, content);

  // Retention. Runs after the writes so the two never contend for one file: a
  // date inside the window is never a prune candidate, and vice versa.
  const deletedPaths = [];
  if (options.apply && cutoff) {
    const expiredItems = expiredItemFiles(webRoot, cutoff);
    const prunedItemIds = new Set(expiredItems.map((path) => basename(path, '.md')));
    for (const path of expiredItems) {
      rmSync(path, { force: true });
      deletedPaths.push(path);
    }
    for (const path of expiredBriefingFiles(webRoot, cutoff)) {
      // Reported either way: a rewrite is a change the publisher has to stage,
      // exactly like a write.
      if (pruneBriefing(path, prunedItemIds) !== 'untouched') deletedPaths.push(path);
    }
  }

  const relative = (path) => path.slice(`${webRoot}/`.length);
  const result = {
    mode: options.apply ? 'apply' : 'dry-run',
    source_root: sourceRoot,
    discovered: discovered.length,
    eligible: records.length,
    reported_entries: records.reduce((total, record) => total + (record.reportedEntries || 0), 0),
    sources_without_reported_count: records.filter((record) => record.reportedEntries === null).length,
    added,
    updated,
    unchanged,
    skipped: skipped.length,
    briefings_written: briefings,
    files_written: options.apply ? changedPaths.size : 0,
    written_paths: options.apply ? [...changedPaths].map(relative).sort() : [],
    window_days: options.windowDays || 0,
    cutoff,
    deleted: options.apply ? deletedPaths.length : 0,
    deleted_paths: options.apply ? deletedPaths.map(relative).sort() : [],
    skipped_details: skipped,
  };
  return result;
}

function args(argv) {
  const result = {
    sourceRoot: process.env.DAILYINFO_WORKSPACE || process.env.DAILYINFO_DATA_ROOT || '',
    webRoot: process.cwd(),
    sourcesConfig: process.env.DAILYINFO_SOURCES || '',
    includePushed: false,
    apply: false,
    date: '',
    windowDays: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') result.apply = true;
    else if (argv[i] === '--include-pushed') result.includePushed = true;
    else if (argv[i] === '--source-root') result.sourceRoot = argv[++i];
    else if (argv[i] === '--web-root') result.webRoot = argv[++i];
    else if (argv[i] === '--sources') result.sourcesConfig = argv[++i];
    else if (argv[i] === '--date') result.date = argv[++i];
    else if (argv[i] === '--window-days') {
      const raw = argv[++i];
      // Rejected rather than coerced: a typo here silently changes how much of
      // the site survives, and 0 means "keep everything" -- the opposite of
      // what someone typing a bad number probably intended.
      if (!/^\d+$/.test(raw ?? '')) throw new Error(`--window-days expects a non-negative integer, got ${JSON.stringify(raw)}`);
      result.windowDays = Number(raw);
    } else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!result.sourceRoot) throw new Error('set DAILYINFO_DATA_ROOT (or DAILYINFO_WORKSPACE / --source-root)');
  if (!result.sourcesConfig) throw new Error('set DAILYINFO_SOURCES (or pass --sources)');
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = syncDailyInfo(args(process.argv.slice(2)));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[dailyinfo-sync] ${error.message}`);
    process.exitCode = 1;
  }
}
