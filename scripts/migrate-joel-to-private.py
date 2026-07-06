#!/usr/bin/env python3
"""
Migrate Joel Birthday 2025 photos from public R2 bucket to private R2 bucket.
Run from the repo root: python3 scripts/migrate-joel-to-private.py
"""

import os, subprocess, sys, tempfile, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

PUBLIC_BASE = "https://pub-d6285edfbb3747a9bbfc77b32aac2baa.r2.dev"
PUBLIC_BUCKET  = "portfolio-images"
PRIVATE_BUCKET = "portfolio-images-private"
WRANGLER_CWD   = os.path.join(os.path.dirname(__file__), "..", "workers", "zip-download")

KEYS = [
    "Joel-Bday-2025/DSCF6858.JPG", "Joel-Bday-2025/DSCF6866.JPG",
    "Joel-Bday-2025/DSCF6867.JPG", "Joel-Bday-2025/DSCF6869.JPG",
    "Joel-Bday-2025/DSCF6876.JPG", "Joel-Bday-2025/DSCF6885.JPG",
    "Joel-Bday-2025/DSCF6887.JPG", "Joel-Bday-2025/DSCF6891.JPG",
    "Joel-Bday-2025/DSCF6892.JPG", "Joel-Bday-2025/DSCF6895.JPG",
    "Joel-Bday-2025/DSCF6908.JPG", "Joel-Bday-2025/DSCF6912.JPG",
    "Joel-Bday-2025/DSCF6915.JPG", "Joel-Bday-2025/DSCF6916.JPG",
    "Joel-Bday-2025/DSCF6917.JPG", "Joel-Bday-2025/DSCF6922.JPG",
    "Joel-Bday-2025/DSCF6924.JPG", "Joel-Bday-2025/DSCF6925.JPG",
    "Joel-Bday-2025/DSCF6929.JPG", "Joel-Bday-2025/DSCF6932.JPG",
    "Joel-Bday-2025/DSCF6933.JPG", "Joel-Bday-2025/DSCF6937.JPG",
    "Joel-Bday-2025/DSCF6938.JPG", "Joel-Bday-2025/DSCF6939.JPG",
    "Joel-Bday-2025/DSCF6941.JPG", "Joel-Bday-2025/DSCF6943.JPG",
    "Joel-Bday-2025/DSCF6949.JPG", "Joel-Bday-2025/DSCF6952.JPG",
    "Joel-Bday-2025/DSCF6953.JPG", "Joel-Bday-2025/DSCF6957.JPG",
    "Joel-Bday-2025/DSCF6958.JPG", "Joel-Bday-2025/DSCF6959.JPG",
    "Joel-Bday-2025/DSCF6970.JPG", "Joel-Bday-2025/DSCF6971.JPG",
    "Joel-Bday-2025/DSCF6974.JPG", "Joel-Bday-2025/DSCF6975.JPG",
    "Joel-Bday-2025/DSCF6977.JPG", "Joel-Bday-2025/DSCF6978.JPG",
    "Joel-Bday-2025/DSCF6982.JPG", "Joel-Bday-2025/DSCF6983.JPG",
    "Joel-Bday-2025/DSCF6984.JPG", "Joel-Bday-2025/DSCF6990.JPG",
    "Joel-Bday-2025/DSCF6997.JPG", "Joel-Bday-2025/DSCF6999.JPG",
    "Joel-Bday-2025/DSCF7005.JPG", "Joel-Bday-2025/DSCF7006.JPG",
    "Joel-Bday-2025/DSCF7008.JPG", "Joel-Bday-2025/DSCF7010.JPG",
    "Joel-Bday-2025/DSCF7011.JPG", "Joel-Bday-2025/DSCF7013.JPG",
    "Joel-Bday-2025/DSCF7014.JPG", "Joel-Bday-2025/DSCF7016.JPG",
    "Joel-Bday-2025/DSCF7018.JPG", "Joel-Bday-2025/DSCF7021.JPG",
    "Joel-Bday-2025/DSCF7022.JPG", "Joel-Bday-2025/DSCF7024.JPG",
    "Joel-Bday-2025/DSCF7025.JPG", "Joel-Bday-2025/DSCF7026.JPG",
    "Joel-Bday-2025/DSCF7030.JPG", "Joel-Bday-2025/DSCF7031.JPG",
    "Joel-Bday-2025/DSCF7034.JPG", "Joel-Bday-2025/DSCF7035.JPG",
    "Joel-Bday-2025/DSCF7040.JPG", "Joel-Bday-2025/DSCF7041.JPG",
    "Joel-Bday-2025/DSCF7042.JPG", "Joel-Bday-2025/DSCF7043.JPG",
    "Joel-Bday-2025/DSCF7045.JPG", "Joel-Bday-2025/DSCF7047.JPG",
    "Joel-Bday-2025/DSCF7053.JPG", "Joel-Bday-2025/DSCF7077.JPG",
    "Joel-Bday-2025/DSCF7087.JPG", "Joel-Bday-2025/DSCF7088.JPG",
    "Joel-Bday-2025/DSCF7093.JPG", "Joel-Bday-2025/DSCF7095.JPG",
]

def download(url, dest):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://raveenfernando.com/",
    })
    with urllib.request.urlopen(req) as r, open(dest, "wb") as f:
        f.write(r.read())


def upload_to_private(key, tmpdir):
    """Download from public R2, upload to private bucket, return key on success."""
    tmpfile = os.path.join(tmpdir, key.replace("/", "_"))
    try:
        download(f"{PUBLIC_BASE}/{key}", tmpfile)
        result = subprocess.run(
            ["npx", "wrangler", "r2", "object", "put",
             f"{PRIVATE_BUCKET}/{key}",
             "--file", tmpfile,
             "--content-type", "image/jpeg"],
            cwd=WRANGLER_CWD,
            capture_output=True, text=True
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr[-200:])
        return key
    finally:
        if os.path.exists(tmpfile):
            os.remove(tmpfile)

def delete_from_public(key):
    """Delete a key from the public bucket."""
    result = subprocess.run(
        ["npx", "wrangler", "r2", "object", "delete",
         f"{PUBLIC_BUCKET}/{key}"],
        cwd=WRANGLER_CWD,
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-200:])
    return key

def main():
    tmpdir = tempfile.mkdtemp(prefix="joel_migration_")
    print(f"Temp dir: {tmpdir}")
    print(f"Migrating {len(KEYS)} photos → {PRIVATE_BUCKET} ...\n")

    uploaded = []
    failed = []

    with ThreadPoolExecutor(max_workers=1) as ex:
        futures = {ex.submit(upload_to_private, k, tmpdir): k for k in KEYS}
        for i, future in enumerate(as_completed(futures), 1):
            key = futures[future]
            try:
                uploaded.append(future.result())
                print(f"  [{i:02d}/{len(KEYS)}] ✓ uploaded  {key.split('/')[-1]}")
            except Exception as e:
                failed.append(key)
                print(f"  [{i:02d}/{len(KEYS)}] ✗ FAILED    {key.split('/')[-1]}: {e}", file=sys.stderr)

    if failed:
        print(f"\n⚠️  {len(failed)} uploads failed — skipping public delete for safety.")
        print("Failed keys:", failed)
        sys.exit(1)

    print(f"\nAll {len(uploaded)} photos uploaded to private bucket.")
    print("Deleting from public bucket ...\n")

    del_failed = []
    for i, key in enumerate(uploaded, 1):
        try:
            delete_from_public(key)
            print(f"  [{i:02d}/{len(uploaded)}] ✓ deleted   {key.split('/')[-1]}")
        except Exception as e:
            del_failed.append(key)
            print(f"  [{i:02d}/{len(uploaded)}] ✗ delete failed {key.split('/')[-1]}: {e}", file=sys.stderr)

    print(f"\n{'✅ Migration complete!' if not del_failed else '⚠️  Some deletes failed (see above)'}")
    print(f"Uploaded: {len(uploaded)}  Delete failures: {len(del_failed)}")

    try:
        os.rmdir(tmpdir)
    except Exception:
        pass

if __name__ == "__main__":
    main()
