#!/usr/bin/env bash
# Shared R2 upload helpers for photography-portfolio.
# Source from scripts/upload-album.sh — not meant to be run directly.

: "${R2_BUCKET:=portfolio-images}"
: "${CF_ACCOUNT_ID:=723c27febd4a099c7884fdf00de2329f}"
: "${ORIG_SLEEP:=15}"
: "${GRID_SLEEP:=10}"
: "${VIEW_SLEEP:=10}"
: "${DOWNLOAD_SLEEP:=10}"
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
    sort_photo_files "$folder"
  fi
}

# Sort by capture time so duplicate exports like _DSF0461(1).jpg land in order.
sort_photo_files() {
  local folder="${1:-}"
  local sorted=()
  if [[ -n "$folder" ]] && command -v exiftool >/dev/null 2>&1; then
    while IFS= read -r line; do
      [[ -n "$line" ]] && sorted+=("$line")
    done < <(
      for fname in "${FILES[@]}"; do
        if [[ -f "$folder/$fname" ]]; then
          exiftool -DateTimeOriginal -filename -T "$folder/$fname" 2>/dev/null
        else
          printf '0000:00:00 00:00:00\t%s\n' "$fname"
        fi
      done | sort -t$'\t' -k1,1 -k2,2 | awk -F'\t' '{print $2}'
    )
  else
    while IFS= read -r line; do
      sorted+=("$line")
    done < <(printf '%s\n' "${FILES[@]}" | sort -u)
  fi
  FILES=("${sorted[@]}")
}

grid_dir_for_prefix() {
  local prefix="$1"
  echo "/tmp/grid_${prefix//\//_}"
}

view_dir_for_prefix() {
  local prefix="$1"
  echo "/tmp/view_${prefix//\//_}"
}

download_dir_for_prefix() {
  local prefix="$1"
  echo "/tmp/download_${prefix//\//_}"
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

  # Wrangler 4.x writes to ~/.wrangler/; older versions used ~/Library/Preferences/.wrangler/
  token=$(grep 'oauth_token' ~/.wrangler/config/default.toml 2>/dev/null | awk -F'"' '{print $2}')
  if [[ -z "$token" ]]; then
    token=$(grep 'oauth_token' ~/Library/Preferences/.wrangler/config/default.toml 2>/dev/null | awk -F'"' '{print $2}')
  fi
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
  local progress="${4:-}"
  local wait attempt
  local prefix=""
  [[ -n "$progress" ]] && prefix="[$progress] "

  if [[ "$DRY_RUN" == "1" ]]; then
    upload_status "${prefix}${label}  ok (dry-run)"
    return 0
  fi

  if [[ ! -f "$file" ]]; then
    upload_status "${prefix}${label}  failed (missing local file)"
    return 1
  fi

  for attempt in 1 2 3 4; do
    if wrangler r2 object put "$dest" --file "$file" --remote >/dev/null 2>&1; then
      upload_status "${prefix}${label}  ok"
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
      upload_status "${prefix}${label}  retry $attempt"
      sleep "$wait"
    fi
  done

  upload_status "${prefix}${label}  failed"
  return 1
}

generate_grids() {
  # Generates 900px q75 grid/ thumbnails for album scroll (matches backfill-image-tiers.sh).
  local folder="$1"
  local grid_dir="$2"
  local fname ok=0 fail=0 skipped=0
  local total=${#FILES[@]} i=0

  mkdir -p "$grid_dir"

  for fname in "${FILES[@]}"; do
    i=$((i + 1))
    if [[ -f "$grid_dir/$fname" && "$SKIP_EXISTING" == "1" ]]; then
      upload_status "[$i/$total] $fname  ok (grid cached)"
      skipped=$((skipped + 1))
      continue
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      upload_status "[$i/$total] $fname  ok (grid dry-run)"
      ok=$((ok + 1))
      continue
    fi
    if sips -Z 900 "$folder/$fname" --out "$grid_dir/$fname" --setProperty formatOptions 75 >/dev/null 2>&1; then
      upload_status "[$i/$total] $fname  ok (grid)"
      ok=$((ok + 1))
    else
      upload_status "[$i/$total] $fname  failed (grid generation)"
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

generate_views() {
  # Generates 2048px q80 view/ images for the lightbox (matches backfill-image-tiers.sh).
  local folder="$1"
  local view_dir="$2"
  local fname ok=0 fail=0 skipped=0
  local total=${#FILES[@]} i=0

  mkdir -p "$view_dir"

  for fname in "${FILES[@]}"; do
    i=$((i + 1))
    if [[ -f "$view_dir/$fname" && "$SKIP_EXISTING" == "1" ]]; then
      upload_status "[$i/$total] $fname  ok (view cached)"
      skipped=$((skipped + 1))
      continue
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      upload_status "[$i/$total] $fname  ok (view dry-run)"
      ok=$((ok + 1))
      continue
    fi
    if sips -Z 2048 "$folder/$fname" --out "$view_dir/$fname" --setProperty formatOptions 80 >/dev/null 2>&1; then
      upload_status "[$i/$total] $fname  ok (view)"
      ok=$((ok + 1))
    else
      upload_status "[$i/$total] $fname  failed (view generation)"
      fail=$((fail + 1))
    fi
  done

  local total=$((${#FILES[@]}))
  if [[ "$skipped" -eq "$total" ]]; then
    upload_status "views  ok ($total cached)"
  else
    upload_status "views  ok ($((ok + skipped))/$total)"
  fi
  [[ "$fail" -gt 0 ]] && upload_status "views  failed ($fail)"
  return "$fail"
}

generate_downloads() {
  # Generates 4000px q88 download/ images for the Large download option.
  local folder="$1"
  local download_dir="$2"
  local fname ok=0 fail=0 skipped=0
  local total=${#FILES[@]} i=0

  mkdir -p "$download_dir"

  for fname in "${FILES[@]}"; do
    i=$((i + 1))
    if [[ -f "$download_dir/$fname" && "$SKIP_EXISTING" == "1" ]]; then
      upload_status "[$i/$total] $fname  ok (download cached)"
      skipped=$((skipped + 1))
      continue
    fi
    if [[ "$DRY_RUN" == "1" ]]; then
      upload_status "[$i/$total] $fname  ok (download dry-run)"
      ok=$((ok + 1))
      continue
    fi
    if sips -Z 4000 "$folder/$fname" --out "$download_dir/$fname" --setProperty formatOptions 88 >/dev/null 2>&1; then
      upload_status "[$i/$total] $fname  ok (download)"
      ok=$((ok + 1))
    else
      upload_status "[$i/$total] $fname  failed (download generation)"
      fail=$((fail + 1))
    fi
  done

  local total=$((${#FILES[@]}))
  if [[ "$skipped" -eq "$total" ]]; then
    upload_status "downloads  ok ($total cached)"
  else
    upload_status "downloads  ok ($((ok + skipped))/$total)"
  fi
  [[ "$fail" -gt 0 ]] && upload_status "downloads  failed ($fail)"
  return "$fail"
}

upload_originals() {
  local folder="$1"
  local r2_prefix="$2"
  local fname fail=0 skipped=0
  local total=${#FILES[@]} i=0 progress=""

  upload_log "originals -> $R2_BUCKET/$r2_prefix/"
  if [[ "$SKIP_EXISTING" == "1" && "$DRY_RUN" != "1" ]]; then
    r2_fetch_index "$r2_prefix/" || true
  fi

  for fname in "${FILES[@]}"; do
    i=$((i + 1))
    progress="$i/$total"
    if [[ "$SKIP_EXISTING" == "1" ]] && r2_object_exists "${r2_prefix}/${fname}"; then
      upload_status "[$progress] $fname  ok (exists)"
      skipped=$((skipped + 1))
      continue
    fi
    upload_with_retry "$R2_BUCKET/$r2_prefix/$fname" "$folder/$fname" "$fname" "$progress" || fail=$((fail + 1))
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
  local total=${#FILES[@]} i=0 progress=""

  upload_log "grids -> $R2_BUCKET/$grid_prefix/"
  if [[ "$SKIP_EXISTING" == "1" && "$DRY_RUN" != "1" ]]; then
    r2_fetch_index "$grid_prefix/" || true
  fi

  for fname in "${FILES[@]}"; do
    i=$((i + 1))
    progress="$i/$total"
    if [[ "$SKIP_EXISTING" == "1" ]] && r2_object_exists "${grid_prefix}/${fname}"; then
      upload_status "[$progress] $fname  ok (exists)"
      skipped=$((skipped + 1))
      continue
    fi
    upload_with_retry "$R2_BUCKET/$grid_prefix/$fname" "$grid_dir/$fname" "$fname" "$progress" || fail=$((fail + 1))
    if [[ "$GRID_SLEEP" -gt 0 && "$DRY_RUN" != "1" ]]; then
      sleep "$GRID_SLEEP"
    fi
  done

  upload_log "grids done (uploaded $((${#FILES[@]} - skipped - fail)), skipped $skipped, failed $fail)"
  return "$fail"
}

upload_views() {
  local view_dir="$1"
  local r2_prefix="$2"
  local fname fail=0 skipped=0
  local view_prefix="view/$r2_prefix"
  local total=${#FILES[@]} i=0 progress=""

  upload_log "views -> $R2_BUCKET/$view_prefix/"
  if [[ "$SKIP_EXISTING" == "1" && "$DRY_RUN" != "1" ]]; then
    r2_fetch_index "$view_prefix/" || true
  fi

  for fname in "${FILES[@]}"; do
    i=$((i + 1))
    progress="$i/$total"
    if [[ "$SKIP_EXISTING" == "1" ]] && r2_object_exists "${view_prefix}/${fname}"; then
      upload_status "[$progress] $fname  ok (exists)"
      skipped=$((skipped + 1))
      continue
    fi
    upload_with_retry "$R2_BUCKET/$view_prefix/$fname" "$view_dir/$fname" "$fname" "$progress" || fail=$((fail + 1))
    if [[ "$VIEW_SLEEP" -gt 0 && "$DRY_RUN" != "1" ]]; then
      sleep "$VIEW_SLEEP"
    fi
  done

  upload_log "views done (uploaded $((${#FILES[@]} - skipped - fail)), skipped $skipped, failed $fail)"
  return "$fail"
}

upload_downloads() {
  local download_dir="$1"
  local r2_prefix="$2"
  local fname fail=0 skipped=0
  local download_prefix="download/$r2_prefix"
  local total=${#FILES[@]} i=0 progress=""

  upload_log "downloads -> $R2_BUCKET/$download_prefix/"
  if [[ "$SKIP_EXISTING" == "1" && "$DRY_RUN" != "1" ]]; then
    r2_fetch_index "$download_prefix/" || true
  fi

  for fname in "${FILES[@]}"; do
    i=$((i + 1))
    progress="$i/$total"
    if [[ "$SKIP_EXISTING" == "1" ]] && r2_object_exists "${download_prefix}/${fname}"; then
      upload_status "[$progress] $fname  ok (exists)"
      skipped=$((skipped + 1))
      continue
    fi
    upload_with_retry "$R2_BUCKET/$download_prefix/$fname" "$download_dir/$fname" "$fname" "$progress" || fail=$((fail + 1))
    if [[ "$DOWNLOAD_SLEEP" -gt 0 && "$DRY_RUN" != "1" ]]; then
      sleep "$DOWNLOAD_SLEEP"
    fi
  done

  upload_log "downloads done (uploaded $((${#FILES[@]} - skipped - fail)), skipped $skipped, failed $fail)"
  return "$fail"
}

verify_uploads() {
  local r2_prefix="$1"
  local missing=0

  upload_log "verifying R2 manifest..."

  for kind in originals grid view download; do
    local key_prefix
    if [[ "$kind" == "originals" ]]; then
      key_prefix="${r2_prefix}/"
    elif [[ "$kind" == "grid" ]]; then
      key_prefix="grid/${r2_prefix}/"
    elif [[ "$kind" == "view" ]]; then
      key_prefix="view/${r2_prefix}/"
    else
      key_prefix="download/${r2_prefix}/"
    fi

    local missing_list=()
    local fname
    for fname in "${FILES[@]}"; do
      if r2_object_exists "${key_prefix}${fname}"; then
        continue
      fi
      missing_list+=("$fname")
    done

    if ((${#missing_list[@]})); then
      upload_log "$kind: missing ${#missing_list[@]}/${#FILES[@]}"
      [[ "$VERBOSE" == "1" ]] && printf '  %s\n' "${missing_list[@]}"
      missing=$((missing + ${#missing_list[@]}))
      if [[ "$kind" == "originals" ]]; then
        printf '%s\n' "${missing_list[@]}" > "/tmp/missing_orig_${r2_prefix//\//_}.txt"
      elif [[ "$kind" == "grid" ]]; then
        printf '%s\n' "${missing_list[@]}" > "/tmp/missing_grid_${r2_prefix//\//_}.txt"
      elif [[ "$kind" == "view" ]]; then
        printf '%s\n' "${missing_list[@]}" > "/tmp/missing_view_${r2_prefix//\//_}.txt"
      else
        printf '%s\n' "${missing_list[@]}" > "/tmp/missing_download_${r2_prefix//\//_}.txt"
      fi
    else
      upload_log "$kind: complete (${#FILES[@]}/${#FILES[@]})"
      if [[ "$kind" == "originals" ]]; then
        rm -f "/tmp/missing_orig_${r2_prefix//\//_}.txt"
      elif [[ "$kind" == "grid" ]]; then
        rm -f "/tmp/missing_grid_${r2_prefix//\//_}.txt"
      elif [[ "$kind" == "view" ]]; then
        rm -f "/tmp/missing_view_${r2_prefix//\//_}.txt"
      else
        rm -f "/tmp/missing_download_${r2_prefix//\//_}.txt"
      fi
    fi
  done

  return "$missing"
}

retry_missing() {
  local folder="$1"
  local grid_dir="$2"
  local view_dir="$3"
  local download_dir="$4"
  local r2_prefix="$5"
  local orig_missing="/tmp/missing_orig_${r2_prefix//\//_}.txt"
  local grid_missing="/tmp/missing_grid_${r2_prefix//\//_}.txt"
  local view_missing="/tmp/missing_view_${r2_prefix//\//_}.txt"
  local download_missing="/tmp/missing_download_${r2_prefix//\//_}.txt"
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

  if [[ -f "$view_missing" ]]; then
    upload_log "retrying missing views..."
    while IFS= read -r fname; do
      [[ -n "$fname" ]] || continue
      upload_with_retry "$R2_BUCKET/view/$r2_prefix/$fname" "$view_dir/$fname" "$fname" || fail=$((fail + 1))
    done < "$view_missing"
  fi

  if [[ -f "$download_missing" ]]; then
    upload_log "retrying missing downloads..."
    while IFS= read -r fname; do
      [[ -n "$fname" ]] || continue
      upload_with_retry "$R2_BUCKET/download/$r2_prefix/$fname" "$download_dir/$fname" "$fname" || fail=$((fail + 1))
    done < "$download_missing"
  fi

  SKIP_EXISTING=1
  return "$fail"
}
