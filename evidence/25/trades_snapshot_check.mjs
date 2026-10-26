// Read-only check: WS `trades` snapshot vs the Real-Time Feed docs and vs the same host's REST trades.
// Fresh WebSocket per limit (the documented "reconnect -> re-subscribe -> rebuild from snapshot" flow).
// Usage: node trades_snapshot_check.mjs <wsUrl> <restBase> <symbol> <rawOutJsonl>
import { appendFileSync, writeFileSync } from "node:fs";
const [WSURL, REST, SYM, RAW] = process.argv.slice(2);
if (!WSURL || !REST || !SYM || !RAW) { console.error("usage: wsUrl restBase symbol rawOut"); process.exit(2); }
writeFileSync(RAW, "");
const now = () => new Date().toISOString();
const hms = (ms) => new Date(Number(ms)).toISOString().slice(11, 23);
const orderOf = (t) => t.length < 2 ? "n/a" : t.every((v, k) => k === 0 || t[k - 1] >= v) ? "DESC(newest first)" : t.every((v, k) => k === 0 || t[k - 1] <= v) ? "ASC(oldest first)" : "MIXED";

async function rest(tag) {
  const url = `${REST}/markets/${encodeURIComponent(SYM)}/trades?limit=100`;
  const r = await fetch(url);
  const txt = await r.text();
  let body = null; try { body = JSON.parse(txt); } catch {}
  const rows = Array.isArray(body) ? body : (body?.trades ?? body?.data ?? []);
  const t = rows.map(x => Number(x.timestamp));
  console.log(now(), `REST(${tag}) GET ${url} -> HTTP ${r.status}, ${rows.length} rows, order ${orderOf(t)}, newest ${hms(Math.max(...t))}, oldest ${hms(Math.min(...t))}`);
  if (rows[0]) console.log(now(), `REST(${tag}) row[0] keys=${Object.keys(rows[0]).join(",")} id=${rows[0].id} ts=${rows[0].timestamp} price=${rows[0].price} qty=${rows[0].quantity ?? rows[0].amount} side=${rows[0].side}`);
  appendFileSync(RAW, JSON.stringify({ at: now(), kind: "rest", tag, status: r.status, rows: rows.slice(0, 3), count: rows.length }) + "\n");
  return rows;
}

function snap(limit) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WSURL);
    const params = { symbols: [SYM], ...(limit === undefined ? {} : { limit }) };
    const msg = { operation: "subscribe", channel: "trades", params };
    const seen = [];
    const done = (res) => { clearTimeout(to); try { ws.close(1000); } catch {} resolve(res); };
    const to = setTimeout(() => done({ timeout: true, seen }), 10000);
    ws.onopen = () => { console.log(now(), ">>", JSON.stringify(msg)); ws.send(JSON.stringify(msg)); };
    ws.onmessage = (ev) => {
      const s = String(ev.data); let j = null; try { j = JSON.parse(s); } catch {}
      appendFileSync(RAW, JSON.stringify({ at: now(), kind: "ws", limit: limit ?? null, raw: s.length > 4000 ? s.slice(0, 4000) + "...[cut]" : s }) + "\n");
      seen.push(j?.type ?? j?.operation ?? "?");
      if (j?.channel === "trades" && j?.type === "snapshot") done({ j, s, seen });
      else if (j?.type === "error") done({ err: s, seen });
    };
    ws.onerror = (e) => done({ err: `websocket error event (${e?.message || e?.type || "no message"})`, seen });
    ws.onclose = (e) => done({ err: `closed before snapshot, code ${e?.code}`, seen });
  });
}

const rows = await rest("before");
const restIds = new Set(rows.map(x => String(x.id)));
const key = (x) => `${x.timestamp}|${x.price}|${x.quantity ?? x.amount}|${x.side}`;
const restKeys = new Set(rows.map(key));
for (const limit of [1, 3, 10, 100, undefined, 500]) {
  const res = await snap(limit);
  if (res.timeout || "err" in res) { console.log(now(), `<< limit=${limit}: ${res.timeout ? "TIMEOUT" : "ERROR " + res.err} msgs=${res.seen.join(",")}`); continue; }
  const tr = res.j.trades;
  if (!Array.isArray(tr)) { console.log(now(), `<< limit=${limit}: trades is ${tr === null ? "null" : typeof tr} (not an array). raw: ${res.s.slice(0, 200)}  msgs=${res.seen.join(",")}`); }
  else {
    const t = tr.map(x => Number(x.timestamp));
    const idHits = tr.filter(x => restIds.has(String(x.id))).length;
    const contentHits = tr.filter(x => restKeys.has(key(x))).length;
    const oldest = tr.length ? Math.min(...t) : null;
    const restInWindow = oldest == null ? 0 : rows.filter(x => Number(x.timestamp) >= oldest).length;
    const restOlder = oldest == null ? 0 : rows.filter(x => Number(x.timestamp) < oldest).length;
    console.log(now(), `<< limit=${limit}: ${tr.length} trades, order ${orderOf(t)}, first ${tr.length ? hms(t[0]) : "-"}, last ${tr.length ? hms(t.at(-1)) : "-"}, ids[0..1]=${tr.slice(0, 2).map(x => x.id).join(" ")}, ids in REST ${idHits}/${tr.length}, same trade by (ts,price,qty,side) in REST ${contentHits}/${tr.length}, REST rows older than WS oldest: ${restOlder}, msgs=${res.seen.join(",")}`);
  }
  await new Promise(r => setTimeout(r, 1200));
}
await rest("after");
process.exit(0);
