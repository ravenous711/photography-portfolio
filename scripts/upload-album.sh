#!/bin/bash
# Upload helper — two-phase workflow per add-portfolio-album skill:
#   1. Generate all grid images locally (sips)
#   2. Upload all originals
#   3. Upload all grid images
# Never interleave orig/grid per file.

set -uo pipefail
export PATH="/opt/homebrew/bin:$PATH"

upload_with_retry() {
  local dest="$1" file="$2" label="$3"
  local wait
  for attempt in 1 2 3 4; do
    if wrangler r2 object put "$dest" --file "$file" --remote; then
      echo "✓ $label"
      return 0
    fi
    if [ "$attempt" -lt 4 ]; then
      case $attempt in 1) wait=15;; 2) wait=30;; 3) wait=60;; esac
      echo "↻ retry $attempt/3 for $label (sleep ${wait}s)..."
      sleep "$wait"
    fi
  done
  echo "✗ FAILED: $label"
  return 1
}
