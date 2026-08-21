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

upload_status "Upload $R2_PREFIX — ${#FILES[@]} photos (sleep orig=${ORIG_SLEEP}s grid=${GRID_SLEEP}s view=${VIEW_SLEEP}s download=${DOWNLOAD_SLEEP}s)"

GRID_DIR="$(grid_dir_for_prefix "$R2_PREFIX")"
VIEW_DIR="$(view_dir_for_prefix "$R2_PREFIX")"
DOWNLOAD_DIR="$(download_dir_for_prefix "$R2_PREFIX")"
TOTAL_FAIL=0

run_originals_phase() {
  upload_originals "$FOLDER" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
}

run_derived_tiers() {
  generate_grids "$FOLDER" "$GRID_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
  generate_views "$FOLDER" "$VIEW_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
  generate_downloads "$FOLDER" "$DOWNLOAD_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
  upload_grids "$GRID_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
  upload_views "$VIEW_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
  upload_downloads "$DOWNLOAD_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
}

case "$PHASE" in
  all)
    generate_grids "$FOLDER" "$GRID_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    generate_views "$FOLDER" "$VIEW_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    generate_downloads "$FOLDER" "$DOWNLOAD_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    run_originals_phase
    upload_grids "$GRID_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    upload_views "$VIEW_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    upload_downloads "$DOWNLOAD_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    ;;
  originals)
    generate_grids "$FOLDER" "$GRID_DIR" || true
    generate_views "$FOLDER" "$VIEW_DIR" || true
    generate_downloads "$FOLDER" "$DOWNLOAD_DIR" || true
    run_originals_phase
    ;;
  grids)
    # --grids-only regenerates + uploads both derived tiers
    if [[ ! -d "$GRID_DIR" ]] || [[ -z "$(ls -A "$GRID_DIR" 2>/dev/null || true)" ]]; then
      generate_grids "$FOLDER" "$GRID_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    fi
    if [[ ! -d "$VIEW_DIR" ]] || [[ -z "$(ls -A "$VIEW_DIR" 2>/dev/null || true)" ]]; then
      generate_views "$FOLDER" "$VIEW_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    fi
    if [[ ! -d "$DOWNLOAD_DIR" ]] || [[ -z "$(ls -A "$DOWNLOAD_DIR" 2>/dev/null || true)" ]]; then
      generate_downloads "$FOLDER" "$DOWNLOAD_DIR" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    fi
    upload_grids "$GRID_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    upload_views "$VIEW_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
    upload_downloads "$DOWNLOAD_DIR" "$R2_PREFIX" || TOTAL_FAIL=$((TOTAL_FAIL + $?))
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
