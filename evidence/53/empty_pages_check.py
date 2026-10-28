#!/usr/bin/env python3
"""Read-only check: the new explorer's address list endpoints return pages with no items but a
next_page_params cursor.  For each query it follows the cursor (max --pages, 1.5 s apart) until the
first non-empty page, and prints Blockscout's first page for the same query.  No keys, no writes.
usage: empty_pages_check.py [--pages N]"""
import json, sys, time, base64, urllib.request, urllib.error, urllib.parse

NEW = "https://new.explorer.somnia.network"
BS = "https://explorer.somnia.network"
HDR = {"User-Agent": "Mozilla/5.0 (feedback repro)", "Accept": "application/json"}
MAXP = int(sys.argv[sys.argv.index("--pages") + 1]) if "--pages" in sys.argv else 40

CASES = [
    ("incoming transactions of an active trading account",
     "/api/v2/addresses/0x601b691a3C6372d6D7345df4f7E5D30d51535aCd/transactions", {"filter": "to"}),
    ("event logs of the WSOMI contract (verified, WETH9)",
     "/api/v2/addresses/0x046EDe9564A72571df6F5e44d0405360c0f4dCab/logs", {}),
]

def get(url, timeout=90):
    req = urllib.request.Request(url, headers=HDR)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            raise SystemExit(f"stopping: HTTP {e.code} from {url}")
        return e.code, {}, {"error": e.read()[:200].decode("latin1")}

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def decode_cursor(np):
    c = (np or {}).get("cursor")
    if not c:
        return ""
    try:
        d = json.loads(base64.urlsafe_b64decode(c + "=" * (-len(c) % 4)))
        if "u" in d:
            d["u_as_time"] = time.strftime("%Y-%m-%d %H:%MZ", time.gmtime(d["u"]))
        return f" cursor decodes to {d}"
    except Exception:
        return ""

def row(x):
    return (x.get("block_number"), (x.get("transaction_hash") or x.get("hash") or "")[:12], x.get("timestamp") or "")

for title, path, params in CASES:
    print(f"\n### {title}\n    {path}  {params or ''}")
    q = dict(params)
    empty = 0
    for i in range(1, MAXP + 1):
        url = NEW + path + ("?" + urllib.parse.urlencode(q) if q else "")
        c, h, j = get(url)
        items = j.get("items", [])
        np = j.get("next_page_params")
        print(f"  {now()} NEW page {i:>2}: HTTP {c} [{h.get('x-api-backend')}] items {len(items):>2}  next_page_params {np}{decode_cursor(np)}"
              + (f"  first item {row(items[0])}" if items else ""))
        if items or not np:
            break
        empty += 1
        q = dict(params); q.update(np)
        time.sleep(1.5)
    print(f"  -> {empty} empty page(s) with a cursor before the first item" + ("" if items else f" (stopped after {MAXP} pages)"))
    time.sleep(1)
    url = BS + path + ("?" + urllib.parse.urlencode(params) if params else "")
    c, h, j = get(url)
    items = j.get("items", [])
    print(f"  {now()} Blockscout page 1: HTTP {c} items {len(items)}  first {row(items[0]) if items else None}  last {row(items[-1]) if items else None}")
    time.sleep(1)
