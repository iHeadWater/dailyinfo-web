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

After GitHub write permission is available, commit/push the generated content.
The push to `main` triggers the existing Pages workflow; the publisher does not
dispatch a second deployment:

```bash
export DAILYINFO_DATA_ROOT="$HOME/.myagentdata/dailyinfo"
export DAILYINFO_SOURCES="/path/to/dailyinfo/config/sources.json"
npm run dailyinfo:publish -- --date "$(date +%F)" --publish
```

Remote publication is deliberately guarded. Its safe defaults are production
branch `main`, remote `origin`, and push URL
`https://github.com/iHeadWater/dailyinfo-web.git`. Override them only when the
deployment repository intentionally differs:

```bash
export DAILYINFO_PUBLISH_BRANCH=main
export DAILYINFO_PUBLISH_REMOTE=origin
export DAILYINFO_PUBLISH_REMOTE_URL=https://github.com/iHeadWater/dailyinfo-web.git
```

Before syncing, publish mode requires a clean worktree, the configured branch
and exact push URL, and a successful fetch. The fetched remote branch must be
an ancestor of local `HEAD`, so a remote-ahead or divergent checkout is
rejected. Local commits awaiting retry are accepted only when their subject is
`publish(dailyinfo): ...` and every changed path is inside the generated content
boundary. A repository-local lock prevents overlapping scheduler runs. After
the gates pass, only paths reported as changed by this sync run are staged; any
unrelated change aborts publication. The report records the branch, remote and
commit hashes. If push fails after commit, the validated local commit is kept
and a later run can safely retry the same push.

The lock owner records PID, hostname and start time. A live local PID is never
preempted, regardless of age. A dead lock on the same host is recovered only
after six hours by default; configure `DAILYINFO_PUBLISH_LOCK_STALE_MS` when the
scheduler requires a different stale threshold. Locks from another host or
locks with unreadable owner metadata require manual verification and removal.

The host scheduler should run `dailyinfo run` first and invoke the publisher
only when collection succeeds. Runtime reports are written atomically to
`runtime/dailyinfo-sync/YYYY-MM-DD.json` and are not committed.

The scheduler must provide both variables above. A primary job runs before the
Discord archive step; a later fallback may run `npm run dailyinfo:fallback` to
scan both `briefings/` and `pushed/`. Scheduling is deployment configuration,
not a repository-specific absolute path.

No bad version is published: sync changes are snapshotted, all four npm gates
must pass, and remote publication happens only afterward. A gate failure
restores generated content. A push failure retains the valid commit so the
exact publication can be retried.
