# DailyInfo → DailyInfo Web publication pipeline

## Handoff

DailyInfo remains the producer of source briefing Markdown under
`$DAILYINFO_DATA_ROOT/briefings/{category}/`. The web publisher reads files
named `{source}_briefing_YYYY-MM-DD{suffix}.md`, resolves source metadata from
`dailyinfo/config/sources.json`, and writes the frozen Publication v1 storage
representation:

- `src/content/items/generated/{category}/dailyinfo-{category}-{source}-{date}.md`
- `src/content/briefings/generated/YYYY/MM/DD/{category}.md`

One source briefing file is one stable Item. Identity comes from category,
source key, date, and an optional batch/part suffix; it never comes from the
title. Re-running the same input upserts the same Item and replaces only the
publisher-owned marked section in the daily Briefing. Existing Briefing items
from other publishers are retained.

DailyInfo owns collection and source Markdown generation. `dailyinfo-web` owns
Publication v1 conversion, schema/integrity validation, build gates, and test
deployment dispatch.

## Commands

Dry-run today's pending briefing directory:

```bash
export DAILYINFO_DATA_ROOT="$HOME/.myagentdata/dailyinfo"
export DAILYINFO_SOURCES="/path/to/dailyinfo/config/sources.json"
npm run dailyinfo:sync
```

Publish content locally and run all four gates, without remote deployment:

```bash
export DAILYINFO_DATA_ROOT="$HOME/.myagentdata/dailyinfo"
export DAILYINFO_SOURCES="/path/to/dailyinfo/config/sources.json"
npm run dailyinfo:publish -- --date "$(date +%F)"
```

After GitHub write permission is available, commit/push the generated content
and dispatch the existing Pages workflow:

```bash
export DAILYINFO_DATA_ROOT="$HOME/.myagentdata/dailyinfo"
export DAILYINFO_SOURCES="/path/to/dailyinfo/config/sources.json"
npm run dailyinfo:publish -- --date "$(date +%F)" --publish
```

The host scheduler should run `dailyinfo run` first and invoke the publisher
only when collection succeeds. Runtime reports are written atomically to
`runtime/dailyinfo-sync/YYYY-MM-DD.json` and are not committed.

The scheduler must provide both variables above. A primary job runs before the
Discord archive step; a later fallback may run `npm run dailyinfo:fallback` to
scan both `briefings/` and `pushed/`. Scheduling is deployment configuration,
not a repository-specific absolute path.

No bad version is published: sync changes are snapshotted, all four npm gates
must pass, and remote publication happens only afterward. A gate failure
restores generated content. A push/dispatch failure retains the valid commit so
the exact publication can be retried.
