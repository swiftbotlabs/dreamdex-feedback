// Read-only check: does offset paging of SDK 0.32.1 getOpenInterestHistory return every row once?
// Node 18+, no dependencies. Sends the exact OpenInterestHistory query from the 0.32.1 package
// (dist/gql/graphql.js, OpenInterestHistoryDocument) to the documented Hideki indexer.
//
// Usage:
//   node oi-paging_check.mjs <pool> [total=1000] [pageSize=100] [control]
//     one read of <total> rows vs pages of <pageSize> (same query), ids compared;
//     "control" repeats the same paging with order_by [{timestamp: desc}, {blockNumber: desc}, {id: desc}].
//   node oi-paging_check.mjs <pool> walk
//     walks the pool's whole history in SDK-default pages of 100 until an empty page.
//   node oi-paging_check.mjs <pool> block <timestamp>
//     the offset 300 / 400 pages (limit 100) and one offset 0 read of 1000 rows, printing only the rows with <timestamp>.

const INDEXER = "https://hideki-dev.smk.somnia.host/v1/graphql";

// Copied verbatim from @somnia-chain/markets-sdk 0.32.1 dist/gql/graphql.js (OpenInterestHistoryDocument).
const SDK_QUERY = `
    query OpenInterestHistory($pool: String!, $limit: Int, $offset: Int) {
  _sdkWatermark: chain_metadata {
    chain_id
    latest_processed_block
  }
  OpenInterestSnapshot(
    where: {pool: {_eq: $pool}}
    order_by: {timestamp: desc}
    limit: $limit
    offset: $offset
  ) {
    id
    pool
    openInterest
    timestamp
    blockNumber
  }
}
    `;
const CONTROL_QUERY = SDK_QUERY.replace(
  "order_by: {timestamp: desc}",
  "order_by: [{timestamp: desc}, {blockNumber: desc}, {id: desc}]",
);
if (CONTROL_QUERY === SDK_QUERY) throw new Error("control rewrite failed");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gq(query, variables) {
  const r = await fetch(INDEXER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}
const short = (id) => "…" + id.slice(42);

async function compare(label, Q, pool, total, page) {
  const newestBefore = (await gq(Q, { pool, limit: 1, offset: 0 })).OpenInterestSnapshot[0]?.id;
  const one = await gq(Q, { pool, limit: total, offset: 0 });
  const ref = one.OpenInterestSnapshot;
  const paged = [];
  for (let off = 0; off < total; off += page) {
    const d = await gq(Q, { pool, limit: Math.min(page, total - off), offset: off });
    d.OpenInterestSnapshot.forEach((x, i) => paged.push({ ...x, off, i }));
    await sleep(200);
  }
  const newestAfter = (await gq(Q, { pool, limit: 1, offset: 0 })).OpenInterestSnapshot[0]?.id;
  const seen = new Set(paged.map((x) => x.id));
  const counts = new Map();
  for (const x of paged) counts.set(x.id, (counts.get(x.id) ?? 0) + 1);
  const repeated = [...counts].filter(([, c]) => c > 1).map(([id]) => id);
  const missing = ref.filter((x) => !seen.has(x.id));
  console.log(
    `${new Date().toISOString()} ${label}: watermark ${one._sdkWatermark[0].latest_processed_block}, ` +
      `newest row before ${short(newestBefore)} / after ${short(newestAfter)}, ` +
      `one read ${ref.length} rows, pages of ${page} -> ${paged.length} rows, ${seen.size} unique, ` +
      `${repeated.length} repeated, ${missing.length} never returned`,
  );
  for (const id of repeated) {
    const occ = paged.filter((x) => x.id === id);
    console.log(`  REPEATED       ${short(id)} ts ${occ[0].timestamp} oi ${occ[0].openInterest} at ` + occ.map((x) => `offset ${x.off} row ${x.i}`).join(" and "));
  }
  for (const x of missing) {
    console.log(`  NEVER RETURNED ${short(x.id)} ts ${x.timestamp} oi ${x.openInterest} (index ${ref.findIndex((y) => y.id === x.id)} of the one read)`);
  }
}

async function walk(pool) {
  const counts = new Map();
  let off = 0, pages = 0, rows = 0;
  for (;;) {
    const d = await gq(SDK_QUERY, { pool, limit: 100, offset: off });
    const r = d.OpenInterestSnapshot;
    if (!r.length) break;
    for (const x of r) counts.set(x.id, (counts.get(x.id) ?? 0) + 1);
    rows += r.length; off += 100; pages++;
    await sleep(200);
  }
  const rep = [...counts].filter(([, c]) => c > 1).map(([id, c]) => `${short(id)} x${c}`);
  console.log(`${new Date().toISOString()} full walk, pages of 100: ${pages} pages, ${rows} rows, ${counts.size} unique ids; repeated: ${rep.join(", ") || "none"}`);
  return counts;
}

async function block(pool, ts) {
  for (const [offset, limit] of [[300, 100], [400, 100], [0, 1000]]) {
    const d = await gq(SDK_QUERY, { pool, limit, offset });
    console.log(`${new Date().toISOString()} offset ${offset} limit ${limit}: ${d.OpenInterestSnapshot.length} rows, first ${short(d.OpenInterestSnapshot[0].id)}, watermark ${d._sdkWatermark[0].latest_processed_block}`);
    d.OpenInterestSnapshot.forEach((x, i) => {
      if (x.timestamp === ts) console.log(`  row ${i} (absolute ${offset + i}) ${short(x.id)} block ${x.blockNumber} oi ${x.openInterest}`);
    });
    await sleep(200);
  }
  const all = await gq(
    `query($p:String!,$t:numeric!){ OpenInterestSnapshot(where:{pool:{_eq:$p}, timestamp:{_eq:$t}}, order_by:{id: asc}) { id blockNumber openInterest } }`,
    { p: pool, t: ts },
  );
  console.log(`  every row with timestamp ${ts}: ` + all.OpenInterestSnapshot.map((x) => `${short(x.id)} (oi ${x.openInterest})`).join(", "));
}

const pool = (process.argv[2] ?? "").toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(pool)) throw new Error("usage: node oi-paging_check.mjs <pool> [total] [pageSize] [control] | walk [id,...] | block <timestamp>");
console.log(`# ${new Date().toISOString()} indexer ${INDEXER}, pool ${pool}, SDK 0.32.1 OpenInterestHistory query (order_by: {timestamp: desc})`);
if (process.argv[3] === "walk") {
  const counts = await walk(pool);
  for (const id of (process.argv[4] ?? "").split(",").filter(Boolean)) {
    console.log(`  ${short(id)} returned by the walk: ${counts.has(id) ? counts.get(id) + " time(s)" : "NEVER"}`);
  }
} else if (process.argv[3] === "block") {
  await block(pool, process.argv[4]);
} else {
  const total = Number(process.argv[3] ?? 1000), page = Number(process.argv[4] ?? 100);
  await compare("SDK order_by {timestamp: desc}", SDK_QUERY, pool, total, page);
  if (process.argv[5] === "control") {
    await compare("control order_by [{timestamp: desc}, {blockNumber: desc}, {id: desc}]", CONTROL_QUERY, pool, total, page);
  }
}
