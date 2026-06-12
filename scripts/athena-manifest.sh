#!/usr/bin/env bash
# Build Athena half-frame film manifests for R2 uploads and config.js.
#
# Usage:
#   ./scripts/athena-manifest.sh              # summary counts
#   ./scripts/athena-manifest.sh --json       # full JSON manifest
#   ./scripts/athena-manifest.sh --config     # config.js filmSection snippets
#   ./scripts/athena-manifest.sh --upload-lists  # file lists per R2 batch
#   ./scripts/athena-manifest.sh --patch-config  # insert filmSections into js/config.js

set -euo pipefail

export PATH="/opt/homebrew/bin:$PATH"
command -v exiftool >/dev/null || { echo "Error: exiftool required" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="summary"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)         MODE="json"; shift ;;
    --config)       MODE="config"; shift ;;
    --upload-lists) MODE="upload-lists"; shift ;;
    --patch-config) MODE="patch-config"; shift ;;
    -h|--help)
      sed -n '2,8p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

exec python3 "$SCRIPT_DIR/lib/athena-manifest.py" "$MODE"
