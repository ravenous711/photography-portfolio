#!/usr/bin/env bash
# Upload Naxos/Athens film rolls with bounded parallelism (add-portfolio-album skill).
# Each roll = one R2 prefix; each upload-album.sh uses ~5 orig workers internally.
# Default: 3 rolls at a time (~15 large PUTs) — not all 13 rolls (that spikes rate limits).
set -uo pipefail  # no -e: a failed roll must not kill the whole batch
export PATH="/opt/homebrew/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
NAXOS="/Users/raveenfernando/Pictures/In Progress/Greece Film/Naxos Export"
ATHENS="/Users/raveenfernando/Pictures/In Progress/Greece Film/Athens Export"
NM="/tmp/greece-naxos-manifest"
AM="/tmp/greece-athens-manifest"
LOGDIR="/tmp/greece-naxos-athens-logs"
MAIN_LOG="/tmp/greece-naxos-athens-upload.log"
# Override: MAX_CONCURRENT_ROLLS=4 ./upload-greece-naxos-athens-parallel.sh
MAX_CONCURRENT_ROLLS="${MAX_CONCURRENT_ROLLS:-3}"

mkdir -p "$LOGDIR"
: >> "$MAIN_LOG"
echo "=== BATCH START max_concurrent_rolls=$MAX_CONCURRENT_ROLLS $(date) ===" >> "$MAIN_LOG"

run_roll() {
  local folder="$1" prefix="$2" list="$3"
  local roll="${prefix##*/}"
  local log="$LOGDIR/${roll}.log"
  [[ -s "$list" ]] || return 0
  {
    echo "=== START $prefix ($(wc -l < "$list" | tr -d ' ') files) $(date) ==="
  } >> "$log"
  echo "=== START $prefix $(date) ===" >> "$MAIN_LOG"
  # Mirror lines to MAIN_LOG so `tail -f` on the main log shows live progress.
  if "$REPO/scripts/upload-album.sh" --folder "$folder" --r2-prefix "$prefix" --file-list "$list" \
    2>&1 | tee -a "$log" | while IFS= read -r line; do
      printf '[%s] %s\n' "$roll" "$line" >> "$MAIN_LOG"
    done; then
    echo "=== DONE $prefix exit=0 $(date) ===" >> "$log"
    echo "=== DONE $prefix exit=0 $(date) ===" >> "$MAIN_LOG"
    return 0
  fi
  echo "=== DONE $prefix exit=$? $(date) ===" >> "$log"
  echo "=== DONE $prefix exit=fail $(date) ===" >> "$MAIN_LOG"
  return 1
}

enqueue_roll() {
  local folder="$1" prefix="$2" list="$3"
  while ((${#pids[@]} >= MAX_CONCURRENT_ROLLS)); do
    wait "${pids[0]}" || fail=$((fail + 1))
    pids=("${pids[@]:1}")
  done
  run_roll "$folder" "$prefix" "$list" &
  pids+=($!)
}

NAXOS_ROLLS=(
  11-Portra160 12-Portra400 13-Ektar100 14-Cinestill800 15-TMax100
  16-Ultramax400 17-TMax400 18-Ektar100 19-Portra400 20-Portra160
)
ATHENS_ROLLS=(20-Portra160 21-Portra400 22-Portra400)

pids=()
fail=0
for roll in "${NAXOS_ROLLS[@]}"; do
  enqueue_roll "$NAXOS" "Greece/Naxos/$roll" "$NM/${roll}.txt"
done
for roll in "${ATHENS_ROLLS[@]}"; do
  enqueue_roll "$ATHENS" "Greece/Athens/$roll" "$AM/${roll}.txt"
done
for pid in "${pids[@]}"; do
  wait "$pid" || fail=$((fail + 1))
done

echo "=== ALL ROLLS COMPLETE fail=$fail $(date) ===" >> "$MAIN_LOG"
exit "$fail"
