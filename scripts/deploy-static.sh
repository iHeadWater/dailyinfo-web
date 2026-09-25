#!/bin/sh
set -eu

# Configuration-driven atomic deployment for the Astro static artifact.
# Remote mode requires DEPLOY_HOST, DEPLOY_USER, and DEPLOY_PATH.
# Local mode is intended only for deployment simulation.

DEPLOY_MODE=${DEPLOY_MODE:-remote}
DEPLOY_PATH=${DEPLOY_PATH:-}
DRY_RUN=${DRY_RUN:-0}
SKIP_BUILD=${SKIP_BUILD:-0}
RELEASE_ID=${RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)}

if [ -z "${SITE_ORIGIN:-}" ] || [ -z "${SITE_BASE:-}" ]; then
  echo "SITE_ORIGIN and SITE_BASE are required." >&2
  exit 2
fi

if [ -z "$DEPLOY_PATH" ]; then
  echo "DEPLOY_PATH is required (for example /var/www/dailyinfo)." >&2
  exit 2
fi

if [ "$SKIP_BUILD" != "1" ]; then
  npm run ci
fi

test -f dist/index.html || {
  echo "dist/index.html is missing; refusing to deploy." >&2
  exit 3
}

RELEASE_REL="releases/$RELEASE_ID"

if [ "$DEPLOY_MODE" = "local" ]; then
  mkdir -p "$DEPLOY_PATH/releases"
  if [ "$DRY_RUN" = "1" ]; then
    rsync -a --delete --dry-run dist/ "$DEPLOY_PATH/$RELEASE_REL/"
    echo "[dry-run] would switch $DEPLOY_PATH/current -> $RELEASE_REL"
    exit 0
  fi

  mkdir -p "$DEPLOY_PATH/$RELEASE_REL"
  rsync -a --delete dist/ "$DEPLOY_PATH/$RELEASE_REL/"
  rm -f "$DEPLOY_PATH/.current-$RELEASE_ID"
  ln -s "$RELEASE_REL" "$DEPLOY_PATH/.current-$RELEASE_ID"
  # BSD/macOS mv needs -h to replace the symlink itself instead of following it.
  mv -fh "$DEPLOY_PATH/.current-$RELEASE_ID" "$DEPLOY_PATH/current"
  echo "Deployed locally: $DEPLOY_PATH/current -> $RELEASE_REL"
  exit 0
fi

if [ "$DEPLOY_MODE" != "remote" ]; then
  echo "DEPLOY_MODE must be remote or local." >&2
  exit 2
fi

if [ -z "${DEPLOY_HOST:-}" ] || [ -z "${DEPLOY_USER:-}" ]; then
  echo "DEPLOY_HOST and DEPLOY_USER are required in remote mode." >&2
  exit 2
fi

REMOTE="$DEPLOY_USER@$DEPLOY_HOST"
RSYNC_DRY_RUN=
if [ "$DRY_RUN" = "1" ]; then
  RSYNC_DRY_RUN=--dry-run
fi

ssh "$REMOTE" "mkdir -p '$DEPLOY_PATH/releases' '$DEPLOY_PATH/$RELEASE_REL'"
# shellcheck disable=SC2086
rsync -az --delete $RSYNC_DRY_RUN dist/ "$REMOTE:$DEPLOY_PATH/$RELEASE_REL/"

if [ "$DRY_RUN" = "1" ]; then
  echo "[dry-run] would switch $DEPLOY_PATH/current -> $RELEASE_REL on $REMOTE"
  exit 0
fi

# The deployment target is Linux; GNU mv -T atomically replaces the current
# symlink rather than moving the new link into the current release directory.
ssh "$REMOTE" "set -eu; rm -f '$DEPLOY_PATH/.current-$RELEASE_ID'; ln -s '$RELEASE_REL' '$DEPLOY_PATH/.current-$RELEASE_ID'; mv -Tf '$DEPLOY_PATH/.current-$RELEASE_ID' '$DEPLOY_PATH/current'"
echo "Deployed remotely: $REMOTE:$DEPLOY_PATH/current -> $RELEASE_REL"
