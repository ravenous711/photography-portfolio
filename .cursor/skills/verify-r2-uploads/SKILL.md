---
name: verify-r2-uploads
description: >-
  Verifies Cloudflare R2 album uploads cheaply, debugs stalled or failed uploads,
  and resumes missing keys without re-downloading originals. Use when checking
  whether an album finished uploading, verifying R2 object existence or sizes,
  debugging empty/zero list results, resuming interrupted wrangler uploads, or
  comparing local manifests against remote prefixes.
---

# Verify R2 Uploads

Reliability rules for portfolio R2 uploads. Companion to [add-portfolio-album](../add-portfolio-album/SKILL.md) — read that skill for the upload workflow; use this one for verify / resume / triage.

**Always request `required_permissions: ["all"]` on the first Shell call** that runs wrangler or hits the Cloudflare API. Waiting for a later approval stalls the agent silently for minutes.

## Checklist (every album session)

- [ ] Diff local manifest vs R2; upload **only missing** keys
- [ ] Detach workers with `nohup` (not `setsid`); write PIDs; confirm alive
- [ ] Keep a success log; still re-verify from R2 before declaring done
- [ ] Cheap verify only — never bulk-download originals
- [ ] One agent owns a given R2 prefix; do not kill "stray" processes while uploads run
- [ ] Upload true full-res exports only (never /tmp size-capped copies as originals)

---

## 1. Cheap verification — never bulk-download originals

NEVER download full originals (often 20–30 MB each) just to verify existence or size. Prefer, in order:

1. `wrangler r2 object info <bucket>/<key> --remote` — size without download
2. Cloudflare REST list API with `prefix=` — all keys + sizes in one call per prefix
3. Ranged/partial fetch for Content-Length only
4. Full download **only** as a last resort, and only for a small suspect subset

Compare byte sizes against local sources. Full shasum only for a few suspicious files.

### Verify a prefix cheaply (copy-paste)

```bash
export PATH="/opt/homebrew/bin:$PATH"
BUCKET="portfolio-images-private"   # or portfolio-images
PREFIX="<R2-folder-name>"           # e.g. Higgins-Lake-2026/Digital
ACCOUNT_ID="723c27febd4a099c7884fdf00de2329f"

# --- A. REST list (fastest for whole prefix) ---
TOKEN=$(grep 'oauth_token' ~/Library/Preferences/.wrangler/config/default.toml | awk -F'"' '{print $2}')
RESP=$(curl -s -w "\n%{http_code}" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/r2/buckets/$BUCKET/objects?prefix=${PREFIX}/&per_page=1000" \
  -H "Authorization: Bearer $TOKEN")
HTTP=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP" != "200" ]; then
  echo "HTTP $HTTP — cached oauth_token may be expired; falling back to wrangler" >&2
  # Fall through to B
else
  echo "$BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not data.get('success') or data.get('result') is None:
    errs = data.get('errors') or data
    print(f'R2 list API error: {errs}', file=sys.stderr)
    sys.exit(1)
for o in data['result']:
    print(f\"{o.get('size', 0)}\t{o['key']}\")
print(f\"# count={len(data['result'])}\", file=sys.stderr)
"
fi

# --- B. wrangler object info loop (per-key; no download) ---
# Use when REST 401s / fails, or to spot-check sizes against a local folder.
LOCAL_DIR="<local export folder>"
while IFS= read -r fname; do
  [[ -z "$fname" ]] && continue
  info=$(wrangler r2 object info "$BUCKET/$PREFIX/$fname" --remote 2>/dev/null) || {
    echo "MISSING  $fname"; continue
  }
  remote_size=$(echo "$info" | awk '/Size:/{print $2; exit}')
  local_size=$(stat -f%z "$LOCAL_DIR/$fname" 2>/dev/null || echo "?")
  if [ "$remote_size" = "$local_size" ]; then
    echo "OK  $remote_size  $fname"
  else
    echo "SIZE_MISMATCH  remote=$remote_size local=$local_size  $fname"
  fi
done < /tmp/<album>-manifest/<section>.txt
```

**Auth note:** The cached `oauth_token` in `~/Library/Preferences/.wrangler/config/default.toml` can be expired even when the wrangler CLI works (CLI refreshes internally). `curl` then 401s while `wrangler` succeeds — detect that and fall back to wrangler.

---

## 2. R2 list API can lie — fail loudly

Cloudflare may return HTTP 200 with `success: false`, `result: null` (rate limit or expired auth).

Naive `len(data['result'])` then reports **0 objects for every prefix**, making a finished album look completely unuploaded — and triggers pointless re-uploads.

**ALWAYS** check before counting:

```python
data = json.load(sys.stdin)
if not data.get('success') or data.get('result') is None:
    print(data.get('errors') or data, file=sys.stderr)
    sys.exit(1)
result = data['result']
```

Never treat a failed list as "empty bucket."

---

## 3. Detached background uploads on macOS

`setsid` does **not** exist on macOS. Scripts "detached" with it are not detached — an interrupted agent shell kills workers mid-flight.

```bash
LOGDIR="/tmp/<album>-logs"
PIDFILE="$LOGDIR/upload.pids"
mkdir -p "$LOGDIR"
: > "$PIDFILE"

# Launch (request required_permissions: ["all"] on THIS call)
nohup bash -c 'upload_worker 0' > "$LOGDIR/worker0.log" 2>&1 &
echo $! >> "$PIDFILE"
nohup bash -c 'upload_worker 1' > "$LOGDIR/worker1.log" 2>&1 &
echo $! >> "$PIDFILE"
# ... more workers ...
disown -a 2>/dev/null || true

# Verify PIDs are actually alive after launch
while read -r pid; do
  if kill -0 "$pid" 2>/dev/null; then
    echo "alive $pid"
  else
    echo "DEAD  $pid" >&2
  fi
done < "$PIDFILE"
```

Monitor: `tail -f $LOGDIR/*.log` and `ps -p $(tr '\n' ',' < "$PIDFILE" | sed 's/,$//')`.

---

## 4. Idempotent, resumable uploads

1. Build a local manifest (one filename per line, sorted).
2. List remote keys for the prefix (cheap verify above).
3. Upload **only** keys present locally but missing (or size-mismatched) on R2.
4. Append each successful filename to a success log.
5. On restart: skip keys already on R2 (and optionally in the success log).
6. **Declare done only after a fresh R2 list/info pass** — logs go stale when workers die.

```bash
# Pseudocode resume filter
comm -23 <(sort local-manifest.txt) <(sort remote-keys.txt) > missing.txt
# upload only missing.txt
```

Never blind re-upload an entire album because a list call returned 0.

---

## 5. Don't stage compressed originals

Originals must be the true full-res exports. If any capped/temp copies exist in `/tmp`, never upload them to the originals key — that silently degrades the archive.

- Grid/view tiers belong under `grid/` and `view/` only.
- If unsure which source a key came from, verify size against the true export (Lightroom/PhotosSSD path), not a `/tmp` derivative.

---

## 6. Coordination — don't self-sabotage

- Do **not** run a "kill stray processes" cleanup while your own uploads are running.
- One owner per upload target. Do not run two agents against the same R2 prefix.
- Check `IMPROVEMENTS.md` → Active album session (and existing PID/log dirs) before starting new workers.

---

## 7. Keep placeholders simple

For a temporary per-album note (e.g. "digital coming soon"), use a config-only text change (`description`, `digitalLabel`). Do **not** add feature flags plus HTML/JS/CSS plumbing for a temporary state.

---

## Symptoms → cause

| Symptom | Likely cause | Fix |
|---|---|---|
| Every prefix reports 0 objects | REST returned `success: false` / `result: null`; error masked | Check `success` + `result`; print `errors`; exit non-zero |
| `curl` 401 but wrangler works | Expired cached `oauth_token` | Fall back to `wrangler r2 object info` / put |
| Workers died after ~3 files | `setsid` on macOS / agent shell interrupt | `nohup` + PID file; verify alive; `required_permissions: ["all"]` |
| Agent silent for minutes | Shell blocked on sandbox approval | Request `["all"]` on the **first** call |
| Album "needs full re-upload" after verify | Trusted a failed list as empty | Re-list with success checks; upload missing only |
| Remote size much smaller than export | Uploaded /tmp capped copy as original | Re-put from true export; size-check |
| Live workers vanished mid-run | Cleanup killed "stray" PIDs | Never kill while uploads own that prefix |
| Success log says done, site missing files | Workers died; log incomplete / stale | Re-verify from R2, not log alone |
