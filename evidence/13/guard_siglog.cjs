// Our own preload (verify-0-repro). Loaded into every node process in the jail via NODE_OPTIONS.
// 1) Egress: TCP only to *.somnia.network / *.somnia.host hostnames, never Somnia MAINNET hosts,
//    never raw IPs / localhost (no local services). Unix sockets only
//    for tsx's own IPC pipe under /tmp/tsx-<uid>/.
// 2) Subprocesses: only node itself, the esbuild service binary, and /bin/sh (npm run-script).
// 3) Optional SIGLOG=1: ONLY in the bot process (argv[1] ends with src/index.ts) add a passive
//    SIGINT/SIGTERM listener that just logs pid + UTC time. It never changes what the bot does,
//    because the bot itself already registers its own SIGINT/SIGTERM handlers (onStop()).
"use strict";
const net = require("node:net");
const ALLOW = [/\.somnia\.network$/i, /\.somnia\.host$/i];
const DENY = [/^api\.infra\.mainnet\.somnia\.network$/i, /^dream-rpc\.somnia\.network$/i, /\.prd\./i];
const okHost = (h) => typeof h === "string" && net.isIP(h) === 0 && ALLOW.some((r) => r.test(h)) && !DENY.some((r) => r.test(h));
const okPipe = (p) => typeof p === "string" && /^\/tmp\/tsx-\d+\/\d+\.pipe$/.test(p);
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let o = args[0];
  if (Array.isArray(o)) o = o[0];
  let host, p;
  if (o && typeof o === "object") { host = o.host; p = o.path; }
  else if (typeof o === "string" && isNaN(Number(o))) { p = o; }
  else { host = typeof args[1] === "string" ? args[1] : "localhost"; }
  const allowed = p !== undefined ? okPipe(p) : okHost(host);
  if (!allowed) {
    const e = new Error("egress blocked: " + (p !== undefined ? "unix socket " + p : String(host)));
    process.stderr.write("[guard] " + e.message + "\n");
    process.nextTick(() => this.destroy(e));
    return this;
  }
  return origConnect.apply(this, args);
};
const cp = require("node:child_process");
const path = require("node:path");
const ESBUILD = "/w/node_modules/@esbuild/linux-arm64/bin/esbuild";
const okCmd = (cmd) => cmd === ESBUILD || cmd === process.execPath || cmd === "/bin/sh" || cmd === "sh" || cmd === "/usr/bin/sh";
const orig = {};
for (const k of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  orig[k] = cp[k];
  cp[k] = function (cmd, ...rest) {
    if ((k === "spawn" || k === "spawnSync") && okCmd(cmd)) return orig[k].call(cp, cmd, ...rest);
    process.stderr.write("[guard] subprocess blocked: " + k + " " + String(cmd).slice(0, 80) + "\n");
    throw new Error("subprocess blocked: " + String(cmd).slice(0, 60));
  };
}
require("node:module").syncBuiltinESMExports();
if (process.env.SIGLOG === "1" && typeof process.argv[1] === "string" && process.argv[1].endsWith(path.join("src", "index.ts"))) {
  for (const s of ["SIGINT", "SIGTERM"]) {
    process.on(s, () => process.stderr.write(`[siglog] bot pid ${process.pid} received ${s} at ${new Date().toISOString()}\n`));
  }
  process.on("exit", (c) => process.stderr.write(`[siglog] bot pid ${process.pid} exit code=${c} at ${new Date().toISOString()}\n`));
}
