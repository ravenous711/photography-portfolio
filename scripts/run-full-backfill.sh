#!/usr/bin/env bash
# scripts/run-full-backfill.sh
# Master backfill runner — drives backfill-image-tiers.sh across all albums in
# batches, logs all output to a timestamped file, and spot-checks completeness.
#
# Usage:
#   ./scripts/run-full-backfill.sh
#   ./scripts/run-full-backfill.sh --batch 1
#   ./scripts/run-full-backfill.sh --batch 2 --dry-run
#   ./scripts/run-full-backfill.sh --fast
#   ./scripts/run-full-backfill.sh --view-only
#   ./scripts/run-full-backfill.sh --grid-only
#   ./scripts/run-full-backfill.sh --download-only
#   ./scripts/run-full-backfill.sh --from Italy/Florence/Digital
#   ./scripts/run-full-backfill.sh --batch 5 --from Joel-Bday-2025
#
# Flags:
#   --batch <n>         Run only batch number n (1-7); omit to run all batches
#   --dry-run           Passed through: shows what would happen, no uploads
#   --fast              Passed through: disables rate-limit sleeps between uploads
#   --view-only         Passed through: skip grid/ generation
#   --grid-only         Passed through: skip view/ generation
#   --download-only     Passed through: generate only the Large download tier
#   --from <prefix>     Skip all prefixes before this one (resume after a failure)
#
# Batches:
#   1 — Italy digital  (Venice, Florence, Rome, Pisa, Assisi)
#   2 — Italy film     (all Italy/Film/* sub-rolls)
#   3 — California     (Santa-Cruz-Big-Sur, Yosemite)
#   4 — Red Rock + misc public  (Red-Rock-Canyon-2026/*, Holland-Tulip-Festival/*)
#   5 — Events/visits  (Ali, Elena, Elenas-Bday, Joel-Bday[private], Paulina's,
#                       Thanksgiving, Maryland-2026-*, Higgins-Lake-2026[private])
#   6 — Misc film + clients  (Misc-Film-Rolls-2026/*, Moksha-Yoga[private])
#   7 — Newer public albums not in the original backfill (Morgan-Alden-2026)
#
# Notes:
#   - Private-bucket prefixes (portfolio-images-private) are passed --private to
#     the inner script and skipped in the verification step (no public HEAD).
#   - A non-zero exit from any single prefix is logged and tallied but does NOT
#     abort the run; failed prefixes are listed in the final summary.
#   - Family/client albums live in portfolio-images-private even though config
#     URLs use ${R2_BASE_URL}. Always pass --private for those prefixes.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/r2-upload-lib.sh
source "$SCRIPT_DIR/lib/r2-upload-lib.sh"

# ── CLI argument parsing ───────────────────────────────────────────────────────

ONLY_BATCH=""
PASSTHROUGH=()
FROM_PREFIX=""

usage() {
  sed -n '2,45p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --batch)     ONLY_BATCH="$2"; shift 2 ;;
    --dry-run)   PASSTHROUGH+=(--dry-run); shift ;;
    --fast)      PASSTHROUGH+=(--fast); shift ;;
    --view-only)  PASSTHROUGH+=(--view-only); shift ;;
    --grid-only)  PASSTHROUGH+=(--grid-only); shift ;;
    --download-only) PASSTHROUGH+=(--download-only); shift ;;
    --force-grid) PASSTHROUGH+=(--force-grid); shift ;;
    --from)      FROM_PREFIX="$2"; shift 2 ;;
    -h|--help)   usage 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage 1
      ;;
  esac
done

# ── Log file ──────────────────────────────────────────────────────────────────

TS="$(date +%Y%m%d-%H%M%S)"
export LOG_FILE="/tmp/backfill-${TS}.log"

log() { echo "$*" | tee -a "$LOG_FILE"; }

log "Photography portfolio — master backfill runner"
log "Started : $(date)"
log "Log file: ${LOG_FILE}"
[[ ${#PASSTHROUGH[@]} -gt 0 ]] && log "Passthrough: ${PASSTHROUGH[*]}"
[[ -n "$FROM_PREFIX" ]] && log "Resume from prefix: ${FROM_PREFIX}"
[[ -n "$ONLY_BATCH"  ]] && log "Running batch ${ONLY_BATCH} only"

# ── Global counters ────────────────────────────────────────────────────────────

TOTAL_RAN=0
TOTAL_ERRORS=0
FAILED_PREFIXES=()

# ── Batch-level state (reset by begin_batch) ───────────────────────────────────

BATCH_NUM=0
BATCH_DESC=""
BATCH_RAN=0
BATCH_ERRORS=0
BATCH_FAILED=()
BATCH_ENTRIES=()   # "prefix" or "prefix --private" — collected for verification

# SKIP_ACTIVE: 1 while --from is in effect and we have not yet reached FROM_PREFIX
SKIP_ACTIVE=0
[[ -n "$FROM_PREFIX" ]] && SKIP_ACTIVE=1

# ── begin_batch / run_prefix / end_batch ──────────────────────────────────────

begin_batch() {
  BATCH_NUM="$1"
  BATCH_DESC="$2"
  BATCH_RAN=0
  BATCH_ERRORS=0
  BATCH_FAILED=()
  BATCH_ENTRIES=()

  log ""
  log "=== BATCH ${BATCH_NUM}: ${BATCH_DESC} ==="
}

# run_prefix PREFIX [--private]
# Runs backfill-image-tiers.sh for one prefix (plus any passthrough flags).
# A non-zero exit is recorded but does not abort the script.
run_prefix() {
  local prefix="$1"
  shift
  # Remaining args are extra flags for this prefix (e.g. --private)
  local extra=("$@")

  local is_private=0
  for f in "${extra[@]+"${extra[@]}"}"; do
    [[ "$f" == "--private" ]] && is_private=1
  done

  # Record entry for later verification (with --private marker if set)
  if [[ "$is_private" == "1" ]]; then
    BATCH_ENTRIES+=("${prefix} --private")
  else
    BATCH_ENTRIES+=("${prefix}")
  fi

  # --from resume: skip until we reach the target prefix
  if [[ "$SKIP_ACTIVE" == "1" ]]; then
    if [[ "$prefix" == "$FROM_PREFIX" ]]; then
      SKIP_ACTIVE=0
      log "  [resume at] ${prefix}"
    else
      log "  [skip] ${prefix}"
      return 0
    fi
  fi

  log ""
  log "  --- prefix: ${prefix}${is_private:+ (private)} ---"

  local exit_code=0
  set +e
  # Unset LOG_FILE for the subprocess so upload_status doesn't also write directly
  # to the log — tee -a below is the sole writer, preventing duplicate log lines.
  LOG_FILE="" "$SCRIPT_DIR/backfill-image-tiers.sh" \
    --prefix "$prefix" \
    "${extra[@]+"${extra[@]}"}" \
    "${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}" \
    2>&1 | tee -a "$LOG_FILE"
  exit_code="${PIPESTATUS[0]}"
  set -e

  BATCH_RAN=$((BATCH_RAN + 1))
  TOTAL_RAN=$((TOTAL_RAN + 1))

  if [[ "$exit_code" -ne 0 ]]; then
    log "  [ERROR] ${prefix} — exit code ${exit_code}"
    BATCH_ERRORS=$((BATCH_ERRORS + 1))
    BATCH_FAILED+=("$prefix")
    TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    FAILED_PREFIXES+=("$prefix")
  else
    log "  [OK] ${prefix}"
  fi
}

# end_batch
# Runs verification for every prefix in the completed batch, prints batch summary.
end_batch() {
  # ── Verification step ──────────────────────────────────────────────────────
  log ""
  log "  -- Verification: batch ${BATCH_NUM} --"

  local vpass=0 vfail=0 vskip=0

  for entry in "${BATCH_ENTRIES[@]+"${BATCH_ENTRIES[@]}"}"; do
    # Parse "prefix [--private]"
    read -r -a parts <<< "$entry"
    local vprefix="${parts[0]}"
    local vis_private=0
    local p
    for p in "${parts[@]:1}"; do [[ "$p" == "--private" ]] && vis_private=1; done

    if [[ "$vis_private" == "1" ]]; then
      log "  verify ${vprefix}  SKIPPED (private bucket)"
      vskip=$((vskip + 1))
      continue
    fi

    # Use r2_list_objects to find the first view/ object for this prefix,
    # then confirm it is publicly accessible with r2_public_exists.
    local first_key
    first_key=$(
      R2_BUCKET="portfolio-images" r2_list_objects "view/${vprefix}/" 2>/dev/null \
        | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    result = data.get("result") or []
    for o in result:
        k = o["key"]
        if not k.endswith("/"):
            print(k)
            break
except Exception:
    pass
' 2>/dev/null
    ) || true

    if [[ -z "$first_key" ]]; then
      log "  verify ${vprefix}  FAIL (no view/ objects found in listing)"
      vfail=$((vfail + 1))
    elif r2_public_exists "$first_key"; then
      log "  verify ${vprefix}  PASS (${first_key})"
      vpass=$((vpass + 1))
    else
      log "  verify ${vprefix}  FAIL (HEAD 404: ${first_key})"
      vfail=$((vfail + 1))
    fi
  done

  log "  Verification: pass=${vpass} fail=${vfail} skipped=${vskip}"

  # ── Batch summary ──────────────────────────────────────────────────────────
  log ""
  log "  == Batch ${BATCH_NUM} summary: ran=${BATCH_RAN} errors=${BATCH_ERRORS} =="
  if [[ "${#BATCH_FAILED[@]}" -gt 0 ]]; then
    log "  Failed prefixes in batch ${BATCH_NUM}:"
    local fp
    for fp in "${BATCH_FAILED[@]}"; do
      log "    - ${fp}"
    done
  fi
}

# ── Batch definitions ──────────────────────────────────────────────────────────
# Each function calls begin_batch / run_prefix [...] / end_batch.

run_batch_1() {
  begin_batch 1 "Italy digital (highest value, biggest)"
  run_prefix "Italy/Venice/Digital"
  run_prefix "Italy/Florence/Digital"
  run_prefix "Italy/Rome/Digital"
  run_prefix "Italy/Pisa/Digital"
  run_prefix "Italy/Assisi/Digital"
  end_batch
}

run_batch_2() {
  begin_batch 2 "Italy film"
  run_prefix "Italy/Film/Athena-Ektar100"
  run_prefix "Italy/Film/Athena-Ultramax-1"
  run_prefix "Italy/Film/Athena-Ultramax-2"
  run_prefix "Italy/Film/FP4"
  run_prefix "Italy/Film/Portra"
  run_prefix "Italy/Film/TMAX"
  run_prefix "Italy/Film/Ultramax"
  end_batch
}

run_batch_3() {
  begin_batch 3 "California"
  run_prefix "California/Santa-Cruz-Big-Sur"
  run_prefix "California/Yosemite"
  end_batch
}

run_batch_4() {
  begin_batch 4 "Red Rock + misc public"
  run_prefix "Red-Rock-Canyon-2026"
  run_prefix "Red-Rock-Canyon-2026/Film/Ektar100"
  run_prefix "Red-Rock-Canyon-2026/Film/Lomography400"
  run_prefix "Holland-Tulip-Festival/Athena-Ultramax" --private
  run_prefix "Holland-Tulip-Festival/Digital" --private
  run_prefix "Holland-Tulip-Festival/Kids-Disposable-1" --private
  run_prefix "Holland-Tulip-Festival/Kids-Disposable-2" --private
  run_prefix "Holland-Tulip-Festival/Raveen-Ultramax" --private
  end_batch
}

run_batch_5() {
  begin_batch 5 "Events / visits"
  run_prefix "Ali-Visit-2025" --private
  run_prefix "Elena-Visit-2025" --private
  run_prefix "Elenas-Bday-2025" --private
  run_prefix "Joel-Bday-2025" --private      # portfolio-images-private
  run_prefix "Paulinas-Wedding-2025" --private
  run_prefix "Thanksgiving-2025" --private
  run_prefix "Maryland-2026-Digital" --private
  run_prefix "Maryland-2026-Roll-Fernando7623" --private
  run_prefix "Maryland-2026-Roll-Fernando7624" --private
  run_prefix "Higgins-Lake-2026/Raveen-AF2" --private
  run_prefix "Higgins-Lake-2026/Raveen-X700" --private
  run_prefix "Higgins-Lake-2026/Athena-Pentax17" --private
  end_batch
}

run_batch_7() {
  begin_batch 7 "Newer public albums"
  run_prefix "Morgan-Alden-2026/Digital"
  run_prefix "Morgan-Alden-2026/Film"
  end_batch
}

run_batch_6() {
  begin_batch 6 "Misc film + clients"
  run_prefix "Misc-Film-Rolls-2026/Tmax-0726"
  run_prefix "Misc-Film-Rolls-2026/Ultramax-0314"
  run_prefix "Moksha-Yoga" --private          # portfolio-images-private
  end_batch
}

# ── Main ───────────────────────────────────────────────────────────────────────

setup_path   # adds /opt/homebrew/bin, verifies wrangler + sips present

if [[ -n "$ONLY_BATCH" ]]; then
  case "$ONLY_BATCH" in
    1) run_batch_1 ;;
    2) run_batch_2 ;;
    3) run_batch_3 ;;
    4) run_batch_4 ;;
    5) run_batch_5 ;;
    6) run_batch_6 ;;
    7) run_batch_7 ;;
    *)
      echo "Error: unknown batch '${ONLY_BATCH}'. Valid values: 1-7." >&2
      exit 1
      ;;
  esac
else
  run_batch_1
  run_batch_2
  run_batch_3
  run_batch_4
  run_batch_5
  run_batch_6
  run_batch_7
fi

# ── Final summary ──────────────────────────────────────────────────────────────

log ""
log "=============================="
log " TOTAL SUMMARY"
log "=============================="
log "  Finished        : $(date)"
log "  Prefixes ran    : ${TOTAL_RAN}"
log "  Prefixes errored: ${TOTAL_ERRORS}"
log "  Log             : ${LOG_FILE}"

if [[ "${#FAILED_PREFIXES[@]}" -gt 0 ]]; then
  log "  Failed prefixes:"
  for fp in "${FAILED_PREFIXES[@]}"; do
    log "    - ${fp}"
  done
fi

log "=============================="

if [[ "$TOTAL_ERRORS" -gt 0 ]]; then
  exit 1
fi
exit 0
