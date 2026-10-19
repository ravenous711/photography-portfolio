#!/usr/bin/env bash
# Upload album photos to Cloudflare R2 (originals + grid/ + view/ + download/ tiers).
#
# Tiers (must match backfill-image-tiers.sh / PERF-1):
#   originals — full resolution
#   grid/     — 900px q75  (album scroll thumbnails)
#   view/     — 2048px q80 (lightbox)
#   download/ — 4000px q88 (Large download, approximately 5 MB)
#
# Usage:
#   ./scripts/upload-album.sh \
#     --folder "/Volumes/PhotosSSD/Photos/2026/06 June/Italy/Export/Rome" \
#     --r2-prefix "Italy/Rome/Digital"
#
# Examples:
#   # Rome digital (all exported JPGs)
#   ./scripts/upload-album.sh \
#     --folder "/Volumes/PhotosSSD/Photos/2026/06 June/Italy/Export/Rome" \
#     --r2-prefix "Italy/Rome/Digital"
#
#   # Starred picks only (rating >= 1)
#   ./scripts/upload-album.sh --folder "..." --r2-prefix "..." --starred
#
#   # 2-star picks only
#   ./scripts/upload-album.sh --folder "..." --r2-prefix "..." --starred --min-rating 2
#
#   # Starred with frame cap (e.g. athena_ektar100_001..055)
#   ./scripts/upload-album.sh --folder "..." --r2-prefix "..." --starred --max-frame 55 --frame-prefix athena_ektar100
#
#   # Explicit file list
#   ./scripts/upload-album.sh --folder "..." --r2-prefix "..." --file-list /tmp/files.txt
#
#   # Faster uploads after a cooldown (no sleep between files)
#   ./scripts/upload-album.sh --folder "..." --r2-prefix "..." --fast
#
#   # Regenerate + upload derived tiers only (originals already on R2)
#   ./scripts/upload-album.sh --folder "..." --r2-prefix "..." --grids-only
#
#   # Dry run
#   ./scripts/upload-album.sh --folder "..." --r2-prefix "..." --dry-run
#
# Phases (default: all):
#   1. Generate grids, views, and Large downloads locally
#   2. Upload originals to portfolio-images/<prefix>/
#   3. Upload grids to portfolio-images/grid/<prefix>/
#   4. Upload views to portfolio-images/view/<prefix>/
#   5. Upload Large downloads to portfolio-images/download/<prefix>/
#   6. Verify manifest + auto-retry missing (unless --no-verify)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/r2-upload-lib.sh
source "$SCRIPT_DIR/lib/r2-upload-lib.sh"

FOLDER=""
R2_PREFIX=""
STARRED=0
PHASE="all"   # all | originals | grids
FAST=0
DRY_RUN=0
VERIFY=1
RETRY_ROUNDS=3
LOG_FILE=""
VERBOSE=0
SKIP_EXISTING=1
MIN_RATING=0
MAX_FRAME=0
FILE_LIST=""
FRAME_PREFIX=""

usage() {
  sed -n '2,45p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --folder)      FOLDER="$2"; shift 2 ;;
    --r2-prefix)   R2_PREFIX="$2"; shift 2 ;;
    --starred)     STARRED=1; shift ;;
    --min-rating)  MIN_RATING="$2"; shift 2 ;;
    --max-frame)   MAX_FRAME="$2"; shift 2 ;;
    --frame-prefix) FRAME_PREFIX="$2"; shift 2 ;;
    --file-list)   FILE_LIST="$2"; shift 2 ;;
    --private)     R2_BUCKET="portfolio-images-private"; shift ;;
    --workers)     ORIG_WORKERS="$2"; shift 2 ;;
    --concurrency) TIER_CONCURRENCY="$2"; shift 2 ;;
    --fast)        FAST=1; ORIG_SLEEP=0; GRID_SLEEP=0; VIEW_SLEEP=0; DOWNLOAD_SLEEP=0; shift ;;
    --sleep-orig)  ORIG_SLEEP="$2"; shift 2 ;;
    --sleep-grid)  GRID_SLEEP="$2"; shift 2 ;;
    --sleep-view)  VIEW_SLEEP="$2"; shift 2 ;;
    --sleep-download) DOWNLOAD_SLEEP="$2"; shift 2 ;;
    --originals-only) PHASE="originals"; shift ;;
    --grids-only)     PHASE="grids"; shift ;;  # derived tiers: grid/ + view/
    --no-verify)   VERIFY=0; shift ;;
    --retry-rounds) RETRY_ROUNDS="$2"; shift 2 ;;
    --log)         LOG_FILE="$2"; shift 2 ;;
    --verbose)     VERBOSE=1; shift ;;
    --force)       SKIP_EXISTING=0; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    -h|--help)     usage 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
done

if [[ -z "$FOLDER" || -z "$R2_PREFIX" ]]; then
  echo "Error: --folder and --r2-prefix are required." >&2
  echo >&2
  usage 1
fi

for n in "$ORIG_WORKERS" "$TIER_CONCURRENCY"; do
  if ! [[ "$n" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: --workers and --concurrency must be positive integers." >&2
    exit 1
  fi
done

# Trim trailing slashes from prefix
R2_PREFIX="${R2_PREFIX#/}"
R2_PREFIX="${R2_PREFIX%/}"

setup_path
enable_nullglob

if [[ -n "$LOG_FILE" ]]; then
  : > "$LOG_FILE"
fi

collect_photo_files "$FOLDER" "$STARRED" "$MIN_RATING" || exit 1
if ((${#FILES[@]} == 0)); then
  echo "Error: no photos found." >&2
  exit 1
fi

upload_status "Upload $R2_BUCKET/$R2_PREFIX — ${#FILES[@]} photos (orig workers=${ORIG_WORKERS} sleep=${ORIG_SLEEP}s, tier concurrency=${TIER_CONCURRENCY})"

GRID_DIR="$(grid_dir_for_prefix "$R2_PREFIX")"
VIEW_DIR="$(view_dir_for_prefix "$R2_PREFIX")"
DOWNLOAD_DIR="$(download_dir_for_prefix "$R2_PREFIX")"
TOTAL_FAIL=0
BG_PIDS=()

# Stop every background worker if the run is interrupted.
trap 'trap - INT TERM; kill 0' INT TERM

# Run a command in its own background subshell; wait_bg collects its failures.
run_bg() {
  ( "$@" ) &
  BG_PIDS+=("$!")
}

wait_bg() {
  local pid
  # bash 3.2 treats an empty "${arr[@]}" as unbound under set -u.
  for pid in ${BG_PIDS[@]+"${BG_PIDS[@]}"}; do
    wait "$pid" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
  done
  BG_PIDS=()
}

tier_dir_empty() {
  [[ ! -d "$1" ]] || [[ -z "$(ls -A "$1" 2>/dev/null || true)" ]]
}

generate_tiers() {
  run_bg generate_grids "$FOLDER" "$GRID_DIR"
  run_bg generate_views "$FOLDER" "$VIEW_DIR"
  run_bg generate_downloads "$FOLDER" "$DOWNLOAD_DIR"
  wait_bg
}

start_tier_uploads() {
  run_bg upload_grids "$GRID_DIR" "$R2_PREFIX"
  run_bg upload_views "$VIEW_DIR" "$R2_PREFIX"
  run_bg upload_downloads "$DOWNLOAD_DIR" "$R2_PREFIX"
}

case "$PHASE" in
  all)
    # Originals start immediately; derived tiers follow as soon as they are generated.
    run_bg upload_originals "$FOLDER" "$R2_PREFIX"
    ORIG_PIDS=("${BG_PIDS[@]}")
    BG_PIDS=()
    generate_tiers
    start_tier_uploads
    BG_PIDS+=("${ORIG_PIDS[@]}")
    wait_bg
    ;;
  originals)
    run_bg upload_originals "$FOLDER" "$R2_PREFIX"
    ORIG_PIDS=("${BG_PIDS[@]}")
    BG_PIDS=()
    # Local tiers are still generated so a later --grids-only run can reuse them.
    SAVED_FAIL=$TOTAL_FAIL
    generate_tiers
    TOTAL_FAIL=$SAVED_FAIL
    BG_PIDS+=("${ORIG_PIDS[@]}")
    wait_bg
    ;;
  grids)
    # --grids-only regenerates (if needed) + uploads grid/, view/, and download/
    tier_dir_empty "$GRID_DIR" && run_bg generate_grids "$FOLDER" "$GRID_DIR"
    tier_dir_empty "$VIEW_DIR" && run_bg generate_views "$FOLDER" "$VIEW_DIR"
    tier_dir_empty "$DOWNLOAD_DIR" && run_bg generate_downloads "$FOLDER" "$DOWNLOAD_DIR"
    wait_bg
    start_tier_uploads
    wait_bg
    ;;
  *)
    echo "Error: unknown phase $PHASE" >&2
    exit 1
    ;;
esac

if [[ "$VERIFY" == "1" && "$DRY_RUN" != "1" ]]; then
  round=1
  missing=999
  while [[ "$round" -le "$RETRY_ROUNDS" ]]; do
    missing=0
    verify_uploads "$R2_PREFIX" || missing=$?
    if [[ "$missing" -eq 0 ]]; then
      upload_log "Verification passed."
      break
    fi
    upload_log "Retry round $round/$RETRY_ROUNDS — $missing missing..."
    retry_missing "$FOLDER" "$GRID_DIR" "$VIEW_DIR" "$DOWNLOAD_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    round=$((round + 1))
  done
  if [[ "$missing" -ne 0 ]]; then
    upload_log "Warning: $missing files still missing after retries."
    TOTAL_FAIL=$((TOTAL_FAIL + missing))
  fi
fi

if [[ "$TOTAL_FAIL" -gt 0 ]]; then
  upload_log "Done with errors (failures=$TOTAL_FAIL)."
  exit 1
fi

upload_log "ALL DONE — ${#FILES[@]} photos uploaded to $R2_PREFIX (original + grid/ + view/ + download/)"
exit 0
