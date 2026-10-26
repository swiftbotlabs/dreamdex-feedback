#!/usr/bin/env bash
# Read-only check: does the SDK's declared homepage (prd.smk.somnia.host/docs/typescript)
# document the 0.32.x APIs that the dreamDEX perps developer page uses?
# Usage: bash check_hosted_reference.sh <pages_dir> <pkg031_dir> <pkg032_dir>
# (pkg dirs = extracted `npm pack` tarballs; read as text only)
set -u
PAGES=${1:?pages dir}; P031=${2:?0.31.0 package dir}; P032=${3:?0.32.1 package dir}
mkdir -p "$PAGES"
B=https://prd.smk.somnia.host/docs/typescript
UA="Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

fetch() { # name url
  local code size
  code=$(curl -sS -A "$UA" -o "$PAGES/$1" -w '%{http_code}' "$2")
  size=$(wc -c < "$PAGES/$1")
  echo "  $code  ${size} B  $2"
  sleep 1
}

echo "### Run $(date -u +%FT%TZ)"
echo
echo "## 1. npm"
echo "npm view @somnia-chain/markets-sdk dist-tags.latest homepage"
npm view @somnia-chain/markets-sdk dist-tags.latest homepage 2>&1 | sed 's/^/  /'
echo "npm view @somnia-chain/markets-sdk time --json | grep -E '\"0\.(31\.0|32\.0|32\.1)\"'"
npm view @somnia-chain/markets-sdk time --json 2>&1 | grep -E '"0\.(31\.0|32\.0|32\.1)"' | sed 's/^/ /'
echo
echo "## 2. Hosted pages (HTTP status, bytes, URL)"
fetch root.html            "$B"
fetch api.html             "$B/api"
fetch var_TESTNET.html     "$B/api/index/variables/SOMNIA_TESTNET_ADDRESSES"
fetch var_HIDEKI.html      "$B/api/index/variables/SOMNIA_HIDEKI_TESTNET_ADDRESSES"
fetch Trader.html          "$B/api/index/interfaces/Trader"
fetch Client.html          "$B/api/index/interfaces/SomniaMarketsClient"
fetch perps.html           "$B/perps"
fetch release-notes.html   "$B/release-notes"
fetch dreamdex_perps_testnet.md "https://app.dreamdex.io/docs/developers/perps-testnet/README.md"
fetch vercel_markets.html  "https://somnia-platform-docs.vercel.app/markets/somnia-markets"
echo
echo "## 3. Name counts on hosted pages (grep -o NAME FILE | wc -l)"
NAMES="claimPerpVoucher buildClaimPerpVoucher getPerpVoucherEligibility getPerpVoucherCampaign getPerpVoucher getAccountEquity listAccountEquities SOMNIA_HIDEKI_TESTNET_ADDRESSES"
for f in Trader.html Client.html perps.html api.html release-notes.html; do
  line="  $f:"
  for n in $NAMES; do line="$line $n=$(grep -o "$n" "$PAGES/$f" | wc -l)"; done
  echo "$line"
done
echo "  controls: Trader.html placePerpOrder=$(grep -o placePerpOrder "$PAGES/Trader.html" | wc -l)  Client.html getMaxPerpOrderSize=$(grep -o getMaxPerpOrderSize "$PAGES/Client.html" | wc -l)  perps.html getMaxPerpOrderSize=$(grep -o getMaxPerpOrderSize "$PAGES/perps.html" | wc -l)"
echo "  perps.html 'Credit vouchers'=$(grep -o 'Credit vouchers' "$PAGES/perps.html" | wc -l)"
echo "  'HIDEKI' (any case) across all fetched prd.smk pages: $(cat "$PAGES"/{root,api,var_TESTNET,Trader,Client,perps,release-notes}.html | grep -oi hideki | wc -l)"
echo "  404 page <title>: $(grep -o '<title>[^<]*</title>' "$PAGES/var_HIDEKI.html" | head -1)"
echo
echo "## 4. Release notes: version headings on the page (first 6, in page order)"
python3 -I - "$PAGES/release-notes.html" <<'PY'
import re, sys, html
t = open(sys.argv[1], encoding="utf-8", errors="replace").read()
heads = re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", t, flags=re.S)
txt = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", h))).strip() for h in heads]
txt = [x for x in txt if x]
print("  headings:", " | ".join(txt[:8]))
vers = sorted({tuple(map(int, v.split("."))) for v in re.findall(r"\b0\.(?:2\d|3\d)\.\d+\b", re.sub(r"<[^>]+>", " ", t))})
print("  highest 0.x.y version named anywhere on the page:", ".".join(map(str, vers[-1])) if vers else None)
print("  any 0.32.x on the page:", any(v[:2] == (0, 32) for v in vers))
PY
echo
echo "## 5. Package contents (grep -rlw NAME package/dist | wc -l = files)"
for n in $NAMES; do
  echo "  $n: 0.31.0=$(grep -rlw "$n" "$P031/dist" | wc -l)  0.32.1=$(grep -rlw "$n" "$P032/dist" | wc -l)"
done
echo "  0.31.0 getAccountEquity hits (ABI entry only, not a client method):"
grep -rnw getAccountEquity "$P031/dist" | sed "s#$P031/##" | cut -c1-160 | sed 's/^/    /'
echo "  0.31.0 dist/somniaMarketsClient.d.ts getAccountEquity|getPerpVoucher: $(grep -c 'getAccountEquity\|getPerpVoucher' "$P031/dist/somniaMarketsClient.d.ts")"
echo "  0.32.1 declarations:"
grep -n "export declare const SOMNIA_HIDEKI_TESTNET_ADDRESSES" "$P032/dist/addresses.d.ts" | sed 's/^/    dist\/addresses.d.ts:/'
grep -nE "^    (getAccountEquity|listAccountEquities|getPerpVoucherCampaign|getPerpVoucherEligibility|getPerpVoucher)\(" "$P032/dist/somniaMarketsClient.d.ts" | cut -c1-140 | sed 's/^/    dist\/somniaMarketsClient.d.ts:/'
grep -rnE "^    (claimPerpVoucher|buildClaimPerpVoucher)\(" "$P032/dist" --include=*.d.ts | sed "s#$P032/##" | cut -c1-160 | sed 's/^/    /'
echo "  docs/PERPS.md 'Credit vouchers': 0.31.0=$(grep -c 'Credit vouchers' "$P031/docs/PERPS.md")  0.32.1: $(grep -n 'Credit vouchers' "$P032/docs/PERPS.md")"
echo "  docs/PERPS.md client.getAccountEquity lines (0.32.1): $(grep -n 'client.getAccountEquity' "$P032/docs/PERPS.md" | cut -d: -f1 | tr '\n' ' ')"
echo "  README.md (0.32.1) links to the hosted site:"
grep -n "documentation map\|docs/typescript/perps)" "$P032/README.md" | cut -c1-150 | sed 's/^/    /'
echo "  package.json homepage: 0.31.0 $(grep '"homepage"' "$P031/package.json" | tr -d ' ,')  0.32.1 $(grep '"homepage"' "$P032/package.json" | tr -d ' ,')"
echo
echo "## 6. dreamDEX perps developer page (README.md) lines that use these APIs"
grep -n "0.32.1\|SOMNIA_HIDEKI_TESTNET_ADDRESSES\|getPerpVoucherEligibility\|claimPerpVoucher\|^## Get test funds" "$PAGES/dreamdex_perps_testnet.md" | cut -c1-170 | sed 's/^/  /'
echo
echo "## 7. The bounty-listed SDK docs link builders to the hosted reference"
python3 -I - "$PAGES/vercel_markets.html" <<'PY'
import re, sys, html
t = open(sys.argv[1], encoding="utf-8", errors="replace").read()
for m in re.finditer(r'<a[^>]+href="([^"]*prd\.smk\.somnia\.host[^"]*)"[^>]*>(.*?)</a>', t, flags=re.S):
    print("  link:", m.group(1), "| text:", re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", m.group(2)))).strip()[:80])
plain = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", t)))
i = plain.find("generated API reference")
print("  quote:", plain[max(0, i-20):i+90] if i >= 0 else "NOT FOUND")
PY
echo
echo "## 8. SOMNIA_* constants: hosted API index vs each package's dist/index.d.ts"
echo "  hosted /api : $(grep -oE 'api/index/variables/SOMNIA_[A-Z_]+' "$PAGES/api.html" | sed 's#.*/##' | sort -u | tr '\n' ' ')"
echo "  0.31.0      : $(grep -ohE '\bSOMNIA_[A-Z_]+\b' "$P031/dist/index.d.ts" | sort -u | tr '\n' ' ')"
echo "  0.32.1      : $(grep -ohE '\bSOMNIA_[A-Z_]+\b' "$P032/dist/index.d.ts" | sort -u | tr '\n' ' ')"
echo "### End $(date -u +%FT%TZ)"
