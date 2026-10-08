"""
cleanup_synthetic_records.py
----------------------------
Safely removes ONLY synthetic-user-* records from the DynamoDB
iam-permission-recommendations table.

Safety guarantees:
  - Scans for records whose user_id begins with "synthetic-user-"
  - Skips ANY record belonging to the four real demo users
  - Dry-run by default; pass --execute to actually delete
  - Prints before/after counts

Usage:
  python cleanup_synthetic_records.py            # dry-run
  python cleanup_synthetic_records.py --execute  # live deletion
"""

import subprocess, json, sys, time

TABLE    = "iam-permission-recommendations"
REGION   = "ap-south-1"
SAFE_IDS = {"demo-developer", "demo-data-analyst", "demo-devops", "demo-backend-dev"}
EXECUTE  = "--execute" in sys.argv


def aws(*args):
    """Run an AWS CLI command and return parsed JSON output."""
    cmd = ["aws"] + list(args) + ["--region", REGION, "--output", "json"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"AWS CLI error:\n{result.stderr}")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def scan_all():
    """Full table scan â€” returns list of {recommendation_id, user_id} dicts."""
    items = []
    kwargs = [
        "dynamodb", "scan",
        "--table-name", TABLE,
        "--projection-expression", "recommendation_id, user_id"
    ]
    resp = aws(*kwargs)
    items.extend(resp.get("Items", []))

    while "LastEvaluatedKey" in resp:
        last_key_json = json.dumps(resp["LastEvaluatedKey"])
        resp = aws(*kwargs, "--exclusive-start-key", last_key_json)
        items.extend(resp.get("Items", []))

    return items


def batch_delete(ids):
    """Delete recommendation_ids in batches of 25 (DynamoDB limit)."""
    total = len(ids)
    deleted = 0
    BATCH = 25
    for i in range(0, total, BATCH):
        chunk = ids[i:i + BATCH]
        requests = [
            {"DeleteRequest": {"Key": {"recommendation_id": {"S": rid}}}}
            for rid in chunk
        ]
        aws(
            "dynamodb", "batch-write-item",
            "--request-items", json.dumps({TABLE: requests})
        )
        deleted += len(chunk)
        print(f"  Deleted {deleted}/{total} synthetic records...")
        time.sleep(0.2)   # gentle throttle
    return deleted


# â”€â”€ STEP 1: Pre-deletion scan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("=" * 60)
print("  IAM Guard â€” Synthetic Record Cleanup")
print("=" * 60)
print(f"\nMode: {'LIVE DELETION' if EXECUTE else 'DRY RUN (pass --execute to delete)'}")
print("\n[1/4] Scanning DynamoDB table...")

all_items = scan_all()
total_in_db = len(all_items)
print(f"      Total records in table: {total_in_db}")

synthetic = [
    item["recommendation_id"]["S"]
    for item in all_items
    if item["user_id"]["S"].startswith("synthetic-user-")
]

real_demo = [
    item
    for item in all_items
    if item["user_id"]["S"] in SAFE_IDS
]

# Guard: ensure no real demo record is mis-classified
accidental = [
    item["recommendation_id"]["S"]
    for item in all_items
    if item["user_id"]["S"] not in SAFE_IDS
    and not item["user_id"]["S"].startswith("synthetic-user-")
]

print(f"      Synthetic records found: {len(synthetic)}")
print(f"      Real demo records found: {len(real_demo)}")
if accidental:
    print(f"  âš ï¸  OTHER user_ids found (NOT touching): {len(accidental)}")

# â”€â”€ STEP 2: Real record pre-check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n[2/4] Pre-deletion real record count:")
real_by_user = {}
for item in real_demo:
    uid = item["user_id"]["S"]
    real_by_user[uid] = real_by_user.get(uid, 0) + 1

EXPECTED = {
    "demo-developer": 44,
    "demo-devops": 22,
    "demo-data-analyst": 9,
    "demo-backend-dev": 8,
}
all_ok = True
for user, expected in EXPECTED.items():
    actual = real_by_user.get(user, 0)
    ok = "[OK]" if actual == expected else "[FAIL]"
    print(f"      {ok} {user}: {actual} (expected {expected})")
    if actual != expected:
        all_ok = False

if not all_ok:
    print("\n  âŒ Real record counts don't match expectations. Aborting.")
    sys.exit(1)

print(f"      All real records verified âœ…")

# â”€â”€ STEP 3: Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if not EXECUTE:
    print(f"\n[3/4] DRY RUN â€” Would delete {len(synthetic)} synthetic records.")
    print("      Run with --execute to perform actual deletion.")
    sys.exit(0)

print(f"\n[3/4] Deleting {len(synthetic)} synthetic records...")
deleted = batch_delete(synthetic)
print(f"      Done. Deleted: {deleted}")

# â”€â”€ STEP 4: Post-deletion verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n[4/4] Post-deletion verification scan...")
time.sleep(2)  # brief pause for DynamoDB consistency
post_items = scan_all()

post_synthetic = [
    item for item in post_items
    if item["user_id"]["S"].startswith("synthetic-user-")
]
post_real = [
    item for item in post_items
    if item["user_id"]["S"] in SAFE_IDS
]

print(f"\n      Total records remaining: {len(post_items)}")
print(f"      Synthetic remaining:      {len(post_synthetic)}")
print(f"      Real demo remaining:      {len(post_real)}")

print("\n      Per-user breakdown (real demo):")
post_by_user = {}
for item in post_real:
    uid = item["user_id"]["S"]
    post_by_user[uid] = post_by_user.get(uid, 0) + 1

final_ok = True
for user, expected in EXPECTED.items():
    actual = post_by_user.get(user, 0)
    ok = "[OK]" if actual == expected else "[FAIL]"
    print(f"      {ok} {user}: {actual} (expected {expected})")
    if actual != expected:
        final_ok = False

# Unique ID check
all_ids = [item["recommendation_id"]["S"] for item in post_items]
unique_ids = len(set(all_ids))
dup_ok = unique_ids == len(all_ids)

print(f"\n      Unique recommendation_ids: {unique_ids} / {len(all_ids)}  {'âœ…' if dup_ok else 'âŒ'}")

# Summary
print("\n" + "=" * 60)
if len(post_synthetic) == 0 and final_ok and dup_ok:
    print("  âœ… CLEANUP COMPLETE â€” All checks passed.")
else:
    print("  âŒ CLEANUP ISSUES DETECTED â€” Review output above.")
print("=" * 60)

