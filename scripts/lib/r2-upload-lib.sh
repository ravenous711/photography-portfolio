#!/usr/bin/env bash
# Shared R2 upload helpers for photography-portfolio.
# Source from scripts/upload-album.sh — not meant to be run directly.

: "${R2_BUCKET:=portfolio-images}"
: "${CF_ACCOUNT_ID:=723c27febd4a099c7884fdf00de2329f}"
: "${ORIG_SLEEP:=15}"
: "${GRID_SLEEP:=10}"
: "${DRY_RUN:=0}"
: "${LOG_FILE:=}"
: "${VERBOSE:=0}"
: "${SKIP_EXISTING:=1}"
: "${MIN_RATING:=0}"
: "${MAX_FRAME:=0}"
: "${FILE_LIST:=}"
: "${FRAME_PREFIX:=}"

: "${R2_PUBLIC_BASE:=https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev}"

R2_INDEX_FILE=""

upload_log() {
  local msg="$1"
  [[ -n "$LOG_FILE" ]] && echo "$msg" >> "$LOG_FILE"
  [[ "$VERBOSE" == "1" ]] && echo "$msg"
}

# Per-file status — always shown (and logged).
upload_status() {
  local msg="$1"
  [[ -n "$LOG_FILE" ]] && echo "$msg" >> "$LOG_FILE"
  echo "$msg"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Error: required command not found: $cmd" >&2
    exit 1
  }
}

setup_path() {
  export PATH="/opt/homebrew/bin:$PATH"
  require_cmd wrangler
  require_cmd sips
}

enable_nullglob() {
  shopt -s nullglob 2>/dev/null || true
}

collect_photo_files() {
  local folder="$1"
  local starred="${2:-0}"
  local min_rating="${3:-$MIN_RATING}"
  FILES=()

  if [[ ! -d "$folder" ]]; then
    echo "Error: folder not found: $folder" >&2
    return 1
  fi

  if [[ -n "$FILE_LIST" ]]; then
    while IFS= read -r fname || [[ -n "$fname" ]]; do
      [[ -n "$fname" && -f "$folder/$fname" ]] && FILES+=("$fname")
    done < "$FILE_LIST"
  elif [[ "$starred" == "1" ]]; then
    require_cmd exiftool
    [[ "$min_rating" -le 0 ]] && min_rating=1
    while IFS= read -r fname; do
      [[ -n "$fname" && -f "$folder/$fname" ]] && FILES+=("$fname")
    done < <(
      exiftool -Rating -filename -T "$folder"/*.JPG "$folder"/*.jpg 2>/dev/null \
        | awk -F'\t' -v min="$min_rating" '$1+0 >= min {print $2}' \
        | sort -u
    )
  else
    local f
    for f in "$folder"/*.jpg "$folder"/*.JPG "$folder"/*.jpeg "$folder"/*.JPEG; do
      [[ -f "$f" ]] || continue
      FILES+=("$(basename "$f")")
    done
    if ((${#FILES[@]})); then
      local sorted=()
      while IFS= read -r line; do
        sorted+=("$line")
      done < <(printf '%s\n' "${FILES[@]}" | sort -u)
      FILES=("${sorted[@]}")
    fi
  fi

  if [[ "$MAX_FRAME" -gt 0 && -n "$FRAME_PREFIX" && ${#FILES[@]} -gt 0 ]]; then
    local filtered=() fname frame
    for fname in "${FILES[@]}"; do
      if [[ "$fname" =~ ${FRAME_PREFIX}_([0-9]+) ]]; then
        frame=$((10#${BASH_REMATCH[1]}))
        [[ "$frame" -le "$MAX_FRAME" ]] && filtered+=("$fname")
      fi
    done
    FILES=("${filtered[@]}")
  fi

  if ((${#FILES[@]})); then
    local sorted=()
    while IFS= read -r line; do
      sorted+=("$line")
    done < <(printf '%s\n' "${FILES[@]}" | sort -u)
    FILES=("${sorted[@]}")
  fi
}

grid_dir_for_prefix() {
  local prefix="$1"
  echo "/tmp/grid_${prefix//\//_}"
}

r2_fetch_index() {
  local prefix="$1"
  R2_INDEX_FILE="/tmp/r2_index_${prefix//\//_}.txt"

  local response
  response=$(r2_list_objects "$prefix") || return 1
  python3 -c '
import json, sys
data = json.load(sys.stdin)
result = data.get("result") or []
for o in result:
    print(o["key"].split("/")[-1])
' <<< "$response" | sort -u > "$R2_INDEX_FILE"
}

r2_has_object() {
  local fname="$1"
  [[ -f "$R2_INDEX_FILE" ]] && grep -Fxq "$fname" "$R2_INDEX_FILE"
}

r2_public_exists() {
  local key="$1"
  local code
  code=$(curl -sI -o /dev/null -w "%{http_code}" "${R2_PUBLIC_BASE}/${key}" 2>/dev/null || echo "000")
  [[ "$code" == "200" ]]
}

r2_object_exists() {
  local key="$1"
  local fname="${key##*/}"
  r2_has_object "$fname" || r2_public_exists "$key"
}

r2_list_objects() {
  local prefix="$1"
  local token

  token=$(grep 'oauth_token' ~/Library/Preferences/.wrangler/config/default.toml 2>/dev/null | awk -F'"' '{print $2}')
  if [[ -z "$token" ]]; then
    echo "Error: could not read wrangler oauth token" >&2
    return 1
  fi

  curl -s \
    "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/r2/buckets/$R2_BUCKET/objects?prefix=${prefix}&per_page=1000" \
    -H "Authorization: Bearer $token"
}

upload_with_retry() {
  local dest="$1"
  local file="$2"
  local label="$3"
  local wait attempt

  if [[ ! -f "$file" ]]; then
    upload_status "$label  failed (missing local file)"
    return 1
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    upload_status "$label  ok (dry-run)"
    return 0
  fi

  for attempt in 1 2 3 4; do
    if wrangler r2 object put "$dest" --file "$file" --remote >/dev/null 2>&1; then
      upload_status "$label  ok"
      # Update local index so later files in the same run see it
      [[ -n "$R2_INDEX_FILE" ]] && echo "$label" >> "$R2_INDEX_FILE"
      return 0
    fi
    if [[ "$attempt" -lt 4 ]]; then
      case "$attempt" in
        1) wait=15 ;;
        2) wait=30 ;;
        3) wait=60 ;;
      esac
      upload_status "$label  retry $attempt"
      sleep "$wait"
    fi
  done

  upload_status "$label  failed"
  return 1
}

generate_grids() {
  local folder="$1"
  local grid_dir="$2"
  local fname ok=0 fail=0 skipped=0

  mkdir -p "$grid_dir"

  for fname in "${FILES[@]}"; do
    if [[ -f "$grid_dir/$fname" ]]; then
      skipped=$((skipped + 1))
      continue
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      ok=$((ok + 1))
      continue
    fi
    if sips -Z 1200 "$folder/$fname" --out "$grid_dir/$fname" --setProperty formatOptions 80 >/dev/null 2>&1; then
      ok=$((ok + 1))
    else
      upload_status "$fname  failed (grid generation)"
      fail=$((fail + 1))
    fi
  done

  local total=$((${#FILES[@]}))
  if [[ "$skipped" -eq "$total" ]]; then
    upload_status "grids  ok ($total cached)"
  else
    upload_status "grids  ok ($((ok + skipped))/$total)"
  fi
  [[ "$fail" -gt 0 ]] && upload_status "grids  failed ($fail)"
  return "$fail"
}

upload_originals() {
  local folder="$1"
  local r2_prefix="$2"
  local fname fail=0 skipped=0

  upload_log "originals -> $R2_BUCKET/$r2_prefix/"
  if [[ "$SKIP_EXISTING" == "1" && "$DRY_RUN" != "1" ]]; then
    r2_fetch_index "$r2_prefix/" || true
  fi

  for fname in "${FILES[@]}"; do
    if [[ "$SKIP_EXISTING" == "1" ]] && r2_object_exists "${r2_prefix}/${fname}"; then
      upload_status "$fname  ok (exists)"
      skipped=$((skipped + 1))
      continue
    fi
    upload_with_retry "$R2_BUCKET/$r2_prefix/$fname" "$folder/$fname" "$fname" || fail=$((fail + 1))
    if [[ "$ORIG_SLEEP" -gt 0 && "$DRY_RUN" != "1" ]]; then
      sleep "$ORIG_SLEEP"
    fi
  done

  upload_log "originals done (uploaded $((${#FILES[@]} - skipped - fail)), skipped $skipped, failed $fail)"
  return "$fail"
}

upload_grids() {
  local grid_dir="$1"
  local r2_prefix="$2"
  local fname fail=0 skipped=0
  local grid_prefix="grid/$r2_prefix"

  upload_log "grids -> $R2_BUCKET/$grid_prefix/"
  if [[ "$SKIP_EXISTING" == "1" && "$DRY_RUN" != "1" ]]; then
    r2_fetch_index "$grid_prefix/" || true
  fi

  for fname in "${FILES[@]}"; do
    if [[ "$SKIP_EXISTING" == "1" ]] && r2_object_exists "${grid_prefix}/${fname}"; then
      upload_status "$fname  ok (exists)"
      skipped=$((skipped + 1))
      continue
    fi
    upload_with_retry "$R2_BUCKET/$grid_prefix/$fname" "$grid_dir/$fname" "$fname" || fail=$((fail + 1))
    if [[ "$GRID_SLEEP" -gt 0 && "$DRY_RUN" != "1" ]]; then
      sleep "$GRID_SLEEP"
    fi
  done

  upload_log "grids done (uploaded $((${#FILES[@]} - skipped - fail)), skipped $skipped, failed $fail)"
  return "$fail"
}

verify_uploads() {
  local r2_prefix="$1"
  local missing=0

  upload_log "verifying R2 manifest..."

  for kind in originals grid; do
    local prefix
    if [[ "$kind" == "originals" ]]; then
      prefix="${r2_prefix}/"
    else
      prefix="grid/${r2_prefix}/"
    fi

    local response uploaded=()
    response=$(r2_list_objects "$prefix") || return 1
    while IFS= read -r line; do
      [[ -n "$line" ]] && uploaded+=("$line")
    done < <(
      python3 -c '
import json, sys
data = json.load(sys.stdin)
result = data.get("result") or []
for o in result:
    print(o["key"].split("/")[-1])
' <<< "$response"
    )

    local missing_list=()
    local fname
    for fname in "${FILES[@]}"; do
      local found=0 u
      if ((${#uploaded[@]})); then
        for u in "${uploaded[@]}"; do
          if [[ "$u" == "$fname" ]]; then
            found=1
            break
          fi
        done
      fi
      [[ "$found" -eq 0 ]] && missing_list+=("$fname")
    done

    if ((${#missing_list[@]})); then
      upload_log "$kind: missing ${#missing_list[@]}/${#FILES[@]}"
      [[ "$VERBOSE" == "1" ]] && printf '  %s\n' "${missing_list[@]}"
      missing=$((missing + ${#missing_list[@]}))
      if [[ "$kind" == "originals" ]]; then
        printf '%s\n' "${missing_list[@]}" > "/tmp/missing_orig_${r2_prefix//\//_}.txt"
      else
        printf '%s\n' "${missing_list[@]}" > "/tmp/missing_grid_${r2_prefix//\//_}.txt"
      fi
    else
      upload_log "$kind: complete (${#FILES[@]}/${#FILES[@]})"
      rm -f "/tmp/missing_orig_${r2_prefix//\//_}.txt" "/tmp/missing_grid_${r2_prefix//\//_}.txt"
    fi
  done

  return "$missing"
}

retry_missing() {
  local folder="$1"
  local grid_dir="$2"
  local r2_prefix="$3"
  local orig_missing="/tmp/missing_orig_${r2_prefix//\//_}.txt"
  local grid_missing="/tmp/missing_grid_${r2_prefix//\//_}.txt"
  local fname fail=0

  SKIP_EXISTING=0

  if [[ -f "$orig_missing" ]]; then
    upload_log "retrying missing originals..."
    while IFS= read -r fname; do
      [[ -n "$fname" ]] || continue
      upload_with_retry "$R2_BUCKET/$r2_prefix/$fname" "$folder/$fname" "$fname" || fail=$((fail + 1))
    done < "$orig_missing"
  fi

  if [[ -f "$grid_missing" ]]; then
    upload_log "retrying missing grids..."
    while IFS= read -r fname; do
      [[ -n "$fname" ]] || continue
      upload_with_retry "$R2_BUCKET/grid/$r2_prefix/$fname" "$grid_dir/$fname" "$fname" || fail=$((fail + 1))
    done < "$grid_missing"
  fi

  SKIP_EXISTING=1
  return "$fail"
}
