# Read-only. Fetches Tokyo (/tokyo/...) pages of the testnet explorer as plain HTTP (what curl, crawlers and
# agents get before any JavaScript runs) and prints which network the server-rendered page says it is on.
# usage: python3 -I ssr_network_check.py      (no keys, no transactions)
import re, html, time, urllib.request
X = 'https://explorer.testnet.somnia.network'
PAGES = ['/tokyo',
         '/tokyo/tx/0x05fa91ea29f12038f7369f38c01babc604cfc1a6061f5ef1b8c3c1c87984e2ec',
         '/tokyo/tx/0x35c9709d9b5a0e951c18cad9ffc49ffcf53f715739fac3e1173f94001ba99619',
         '/tokyo/address/0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0',
         '/tokyo/block/35210700']
NAV = ['/blocks', '/txs', '/tokens', '/top-accounts', '/verified-contracts', '/charts']
def get(p):
    r = urllib.request.Request(X + p, headers={'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141'})
    with urllib.request.urlopen(r, timeout=40) as f:
        return f.status, f.read().decode('utf-8', 'replace')
def text(s):
    s = re.sub(r'<script.*?</script>', '', s, flags=re.S); s = re.sub(r'<style.*?</style>', '', s, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s)))
print('run', time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
for p in PAGES:
    code, s = get(p); t = text(s)
    chip = re.search(r'Explorer (Global testnet|Tokyo testnet|Global) (\d+)', t)
    foot = re.search(r'somnia explorer · ([a-z ]+) · chain (\d+)', t)
    crumb = re.search(r'Blockchain / ([A-Za-z ]+) / ', t)
    hrefs = re.findall(r'href="([^"]+)"', s)
    nav = {n: ('/tokyo' + n in hrefs, n in hrefs) for n in NAV}
    print(f'\n{p}  HTTP {code}')
    print(f'  network chip : {chip.group(1) + " " + chip.group(2) if chip else None}')
    print(f'  footer       : {foot.group(1) + " · chain " + foot.group(2) if foot else None}')
    print(f'  breadcrumb   : {crumb.group(1) if crumb else "(none)"}')
    print(f'  meta desc    : {(re.search(r"<meta name=\"description\" content=\"([^\"]*)", s) or [None, None])[1]}')
    print(f'  sidebar links: ' + ', '.join(f'{n} -> {"/tokyo"+n if a else n if b else "?"}' for n, (a, b) in nav.items()))
    for kw in ('Chain id', 'RPC', 'WebSocket', 'Live from', 'Connecting to'):
        m = re.search(re.escape(kw) + r' (\S+(?: \S+){0,3})', t)
        if m and p == '/tokyo': print(f'  {kw:13}: {m.group(1)}')
