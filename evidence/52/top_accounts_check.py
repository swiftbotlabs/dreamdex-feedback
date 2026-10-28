#!/usr/bin/env python3
"""Read-only check: does the new explorer's Top accounts list (GET /api/v2/addresses) contain every
account that holds more SOMI than its own #50 row?  Compares with explorer.somnia.network (Blockscout,
same chain) and with eth_getBalance on the Somnia mainnet RPC, and prints the two explorers' Etherscan
`stats/ethsupply` next to the documented fixed supply.  No keys, no transactions."""
import json, time, urllib.request, urllib.error, urllib.parse

NEW = "https://new.explorer.somnia.network"
BS = "https://explorer.somnia.network"
RPC = "https://api.infra.mainnet.somnia.network/"
HDR = {"User-Agent": "Mozilla/5.0 (feedback repro)", "Accept": "application/json"}

def get(url, timeout=90):
    req = urllib.request.Request(url, headers=HDR)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            raise SystemExit(f"stopping: HTTP {e.code} from {url}")
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()[:200]

def rpc_batch(calls):
    body = json.dumps([{"jsonrpc": "2.0", "id": i, "method": m, "params": p} for i, (m, p) in enumerate(calls)]).encode()
    req = urllib.request.Request(RPC, data=body, headers={"content-type": "application/json", **HDR})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = sorted(json.loads(r.read()), key=lambda x: x["id"])
    return [x.get("result") for x in res]

def somi(wei):
    return f"{int(wei) / 1e18:,.2f}"

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def pages(base, n):
    items, q = [], ""
    for _ in range(n):
        c, h, j = get(f"{base}/api/v2/addresses{q}")
        items += j["items"]
        np = j.get("next_page_params")
        if not np:
            break
        q = "?" + urllib.parse.urlencode(np)
        time.sleep(1)
    return c, h, items

print(f"== {now()} GET {NEW}/api/v2/addresses (3 pages)")
c, h, new_items = pages(NEW, 3)
print(f"   HTTP {c}, x-api-backend: {h.get('x-api-backend')}, {len(new_items)} rows; "
      f"#1 {somi(new_items[0]['coin_balance'])} SOMI, #50 {somi(new_items[49]['coin_balance'])} SOMI, "
      f"#{len(new_items)} {somi(new_items[-1]['coin_balance'])} SOMI")
print(f"   transactions_count of rows 1-50: {sorted(set(str(x.get('transactions_count')) for x in new_items[:50]))}")
time.sleep(1)
print(f"== {now()} GET {BS}/api/v2/addresses (1 page)")
c, h, bs_items = pages(BS, 1)
print(f"   HTTP {c}, {len(bs_items)} rows")

new_set = {x["hash"].lower(): i + 1 for i, x in enumerate(new_items)}
cut = int(new_items[49]["coin_balance"])
cand = [x["hash"] for x in bs_items]
res = rpc_batch([("eth_getBalance", [a, "latest"]) for a in cand] + [("eth_getTransactionCount", [a, "latest"]) for a in cand]
                + [("eth_getCode", [a, "latest"]) for a in cand] + [("eth_blockNumber", [])])
n = len(cand)
head = int(res[-1], 16)
print(f"== {now()} RPC eth_getBalance at head {head:,} for Blockscout's top 50")
missing = []
for i, a in enumerate(cand):
    bal = int(res[i], 16)
    if bal > cut and a.lower() not in new_set:
        missing.append((a, bal, int(res[n + i], 16), res[2 * n + i] not in ("0x", None)))
total_missing = sum(m[1] for m in missing)
print(f"   accounts holding more than the new explorer's #50 ({somi(cut)} SOMI) but absent from its first "
      f"{len(new_items)} rows: {len(missing)}, together {somi(total_missing)} SOMI")
for a, bal, nonce, code in missing:
    rank = 1 + sum(1 for x in new_items[:50] if int(x["coin_balance"]) > bal)
    print(f"   {a}  {somi(bal):>16} SOMI  {'contract' if code else 'EOA     '} nonce {nonce}  -> would rank #{rank}")

print(f"== {now()} the new explorer's own address page for each missing account")
for a, bal, nonce, code in missing[:3]:
    c, h, j = get(f"{NEW}/api/v2/addresses/{a}")
    print(f"   {a}  coin_balance {somi(j['coin_balance'])} SOMI  name {j.get('name')!r}  "
          f"creator {j.get('creator_address_hash')}  creation_tx {j.get('creation_transaction_hash')}")
    time.sleep(1)

print(f"== {now()} how they were funded (Blockscout; no top-level transaction has them as sender or recipient)")
for a, bal, nonce, code in missing[:3]:
    c, h, tx = get(f"{BS}/api/v2/addresses/{a}/transactions"); time.sleep(1)
    c, h, cbh = get(f"{BS}/api/v2/addresses/{a}/coin-balance-history"); time.sleep(1)
    first = cbh.get("items", [])[-1] if cbh.get("items") else None
    line = f"   {a}  top-level transactions: {len(tx.get('items', []))}"
    if first:
        c, h, t = get(f"{BS}/api/v2/transactions/{first['transaction_hash']}"); time.sleep(1)
        line += (f"; first balance change +{somi(first['delta'])} SOMI at block {first['block_number']:,} "
                 f"({first['block_timestamp']}) in tx {first['transaction_hash']}, a call from "
                 f"{t['from']['hash']} to {(t.get('to') or {}).get('hash')} (method {t.get('method')})")
    print(line)

print(f"== {now()} Etherscan-style native supply")
for base in (NEW, BS):
    c, h, j = get(f"{base}/api?module=stats&action=ethsupply")
    print(f"   {base}/api?module=stats&action=ethsupply -> {somi(j['result'])} SOMI")
    time.sleep(1)
print("   docs (new.docs.somnia.network/concepts/tokenomics/overview.md): 'with a fixed supply of 1,000,000,000 tokens'")
