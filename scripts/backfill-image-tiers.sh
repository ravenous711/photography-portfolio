#!/usr/bin/env bash
# Backfill view/ (2048px q80) and grid/ (900px q75) image tiers from R2 originals.
#
# Reads originals already in R2 (public or private bucket), derives both tiers
# in one pass per photo, and uploads them back. Fully resumable: reruns skip
# keys that already exist. Tracks view/ and grid/ existence independently so a
# rerun can complete whichever tier is still missing.
#
# Usage:
#   ./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital
#   ./scripts/backfill-image-tiers.sh --prefix Moksha-Yoga --private
#   ./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital --dry-run
#   ./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital --limit 5
#   ./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital --view-only
#   ./scripts/backfill-image-tiers.sh --prefix Italy/Venice/Digital --grid-only
#
# Flags:
#   --prefix <path>   R2 key prefix to process (required)
#   --private         Use portfolio-images-private bucket instead of portfolio-images
#   --dry-run         Print what would happen; no downloads, resizes, or uploads
#   --fast            No sleep between uploads (use after a cooldown)
#   --limit <n>       Process only the first N originals (for trial runs)
#   --view-only       Skip grid/ regeneration
#   --grid-only       Skip view/ generation
#   --sleep <s>       Seconds between uploads (default 5)
#
# Output per photo:
#   [i/total] <key>  view=ok grid=ok   (or skipped / failed per tier)
#
# Summary at the end:
#   Done. processed=N skipped=N failed=N

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/r2-upload-lib.sh
source "$SCRIPT_DIR/lib/r2-upload-lib.sh"

PREFIX=""
PRIVATE=0
DRY_RUN=0
FAST=0
LIMIT=0
VIEW_ONLY=0
GRID_ONLY=0
SLEEP_BETWEEN=5

usage() {
  sed -n '2,28p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)    PREFIX="$2"; shift 2 ;;
    --private)   PRIVATE=1; shift ;;
    --dry-run)   DRY_RUN=1; shift ;;
    --fast)      FAST=1; SLEEP_BETWEEN=0; shift ;;
    --limit)     LIMIT="$2"; shift 2 ;;
    --view-only) VIEW_ONLY=1; shift ;;
    --grid-only) GRID_ONLY=1; shift ;;
    --sleep)     SLEEP_BETWEEN="$2"; shift 2 ;;
    -h|--help)   usage 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
done

if [[ -z "$PREFIX" ]]; then
  echo "Error: --prefix is required." >&2
  echo >&2
  usage 1
fi

PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"

# ── Bucket configuration ─────────────────────────────────────────────────────

if [[ "$PRIVATE" == "1" ]]; then
  BUCKET_NAME="portfolio-images-private"
else
  BUCKET_NAME="portfolio-images"
fi

# Override R2_BUCKET so r2_list_objects uses the right bucket
export R2_BUCKET="$BUCKET_NAME"

setup_path
enable_nullglob

# ── Helpers ──────────────────────────────────────────────────────────────────

# Make a safe filename for /tmp from an R2 key (replace / with _)
safe_name() {
  echo "${1//\//_}"
}

# Check if a given R2 key exists. For public bucket use HEAD; for private use
# wrangler (since the bucket is not publicly accessible).
r2_key_exists() {
  local key="$1"
  if [[ "$PRIVATE" == "1" ]]; then
    wrangler r2 object get "${BUCKET_NAME}/${key}" --file /dev/null --remote >/dev/null 2>&1
  else
    r2_public_exists "$key"
  fi
}

# Fetch the original file from R2 to a temp path.
fetch_original() {
  local key="$1"
  local dest="$2"
  if [[ "$PRIVATE" == "1" ]]; then
    wrangler r2 object get "${BUCKET_NAME}/${key}" --file "$dest" --remote >/dev/null 2>&1
  else
    curl -fsSL "${R2_PUBLIC_BASE}/${key}" -o "$dest" 2>/dev/null
  fi
}

# ── List originals under prefix ───────────────────────────────────────────────

upload_status "Listing originals under ${BUCKET_NAME}/${PREFIX}/ ..."

# r2_list_objects returns JSON; extract keys, skip grid/ and view/ prefixes
ORIG_KEYS=()
while IFS= read -r key; do
  [[ -n "$key" ]] || continue
  # Skip tier prefixes, directory markers, and non-image entries
  [[ "$key" == grid/* ]] && continue
  [[ "$key" == view/* ]] && continue
  [[ "$key" == */ ]] && continue
  [[ "$key" =~ \.(jpg|JPG|jpeg|JPEG|png|PNG|webp|WEBP)$ ]] || continue
  ORIG_KEYS+=("$key")
done < <(
  r2_list_objects "$PREFIX/" 2>/dev/null | python3 -c '
import json, sys
data = json.load(sys.stdin)
result = data.get("result") or []
for o in result:
    print(o["key"])
' 2>/dev/null | sort -u
)

if ((${#ORIG_KEYS[@]} == 0)); then
  echo "No originals found under ${BUCKET_NAME}/${PREFIX}/. Check --prefix and --private flags." >&2
  exit 1
fi

TOTAL="${#ORIG_KEYS[@]}"

# Apply --limit if set
if [[ "$LIMIT" -gt 0 && "$TOTAL" -gt "$LIMIT" ]]; then
  ORIG_KEYS=("${ORIG_KEYS[@]:0:$LIMIT}")
  TOTAL="$LIMIT"
fi

upload_status "Found $TOTAL originals to process."

# ── Process each original ─────────────────────────────────────────────────────

COUNT_PROCESSED=0
COUNT_SKIPPED=0
COUNT_FAILED=0

i=0
for key in "${ORIG_KEYS[@]}"; do
  i=$((i + 1))
  PROGRESS="$i/$TOTAL"
  SNAME="$(safe_name "$key")"

  VIEW_KEY="view/${key}"
  GRID_KEY="grid/${key}"

  TMP_ORIG="/tmp/backfill_orig_${SNAME}"
  TMP_VIEW="/tmp/backfill_view_${SNAME}"
  TMP_GRID="/tmp/backfill_grid_${SNAME}"

  # Independently check which tiers are needed
  NEED_VIEW=1
  NEED_GRID=1

  if [[ "$VIEW_ONLY" == "1" ]]; then
    NEED_GRID=0
  fi
  if [[ "$GRID_ONLY" == "1" ]]; then
    NEED_VIEW=0
  fi

  VIEW_STATUS="skipped"
  GRID_STATUS="skipped"

  # Skip check: does view/ already exist?
  if [[ "$NEED_VIEW" == "1" ]]; then
    if [[ "$DRY_RUN" == "1" ]]; then
      VIEW_STATUS="would-create"
    elif r2_key_exists "$VIEW_KEY"; then
      NEED_VIEW=0
      VIEW_STATUS="skipped"
    fi
  fi

  # Skip check: does grid/ already exist?
  if [[ "$NEED_GRID" == "1" ]]; then
    if [[ "$DRY_RUN" == "1" ]]; then
      GRID_STATUS="would-create"
    elif r2_key_exists "$GRID_KEY"; then
      NEED_GRID=0
      GRID_STATUS="skipped"
    fi
  fi

  # If both already exist (or skipped by flag), move on
  if [[ "$NEED_VIEW" == "0" && "$NEED_GRID" == "0" ]]; then
    upload_status "[$PROGRESS] $key  view=${VIEW_STATUS} grid=${GRID_STATUS}"
    COUNT_SKIPPED=$((COUNT_SKIPPED + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    upload_status "[$PROGRESS] $key  view=${VIEW_STATUS} grid=${GRID_STATUS}"
    COUNT_PROCESSED=$((COUNT_PROCESSED + 1))
    continue
  fi

  # Fetch original once
  if ! fetch_original "$key" "$TMP_ORIG"; then
    upload_status "[$PROGRESS] $key  view=failed grid=failed (fetch error)"
    COUNT_FAILED=$((COUNT_FAILED + 1))
    rm -f "$TMP_ORIG"
    continue
  fi

  KEY_FAIL=0

  # Generate and upload view/ (2048px q80)
  if [[ "$NEED_VIEW" == "1" ]]; then
    if sips -Z 2048 "$TMP_ORIG" --out "$TMP_VIEW" --setProperty formatOptions 80 >/dev/null 2>&1; then
      if upload_with_retry "${BUCKET_NAME}/${VIEW_KEY}" "$TMP_VIEW" "$VIEW_KEY" "$PROGRESS"; then
        VIEW_STATUS="ok"
      else
        VIEW_STATUS="failed"
        KEY_FAIL=$((KEY_FAIL + 1))
      fi
    else
      VIEW_STATUS="failed(resize)"
      KEY_FAIL=$((KEY_FAIL + 1))
    fi
    rm -f "$TMP_VIEW"
    if [[ "$SLEEP_BETWEEN" -gt 0 ]]; then sleep "$SLEEP_BETWEEN"; fi
  fi

  # Generate and upload grid/ (900px q75)
  if [[ "$NEED_GRID" == "1" ]]; then
    if sips -Z 900 "$TMP_ORIG" --out "$TMP_GRID" --setProperty formatOptions 75 >/dev/null 2>&1; then
      if upload_with_retry "${BUCKET_NAME}/${GRID_KEY}" "$TMP_GRID" "$GRID_KEY" "$PROGRESS"; then
        GRID_STATUS="ok"
      else
        GRID_STATUS="failed"
        KEY_FAIL=$((KEY_FAIL + 1))
      fi
    else
      GRID_STATUS="failed(resize)"
      KEY_FAIL=$((KEY_FAIL + 1))
    fi
    rm -f "$TMP_GRID"
    if [[ "$SLEEP_BETWEEN" -gt 0 && "$NEED_VIEW" == "1" ]]; then sleep "$SLEEP_BETWEEN"; fi
  fi

  rm -f "$TMP_ORIG"

  upload_status "[$PROGRESS] $key  view=${VIEW_STATUS} grid=${GRID_STATUS}"

  if [[ "$KEY_FAIL" -gt 0 ]]; then
    COUNT_FAILED=$((COUNT_FAILED + 1))
  else
    COUNT_PROCESSED=$((COUNT_PROCESSED + 1))
  fi
done

echo ""
echo "Done. processed=${COUNT_PROCESSED} skipped=${COUNT_SKIPPED} failed=${COUNT_FAILED}"

if [[ "$COUNT_FAILED" -gt 0 ]]; then
  exit 1
fi
exit 0
