// Real transactions on Tokyo from our own test key: a perp order with a builder code, then where the fee went.
import { createPublicClient, createWalletClient, http, parseAbi, defineChain, formatUnits, decodeEventLog, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const raw = process.env.PRIVATE_KEY;   // a funded Tokyo test key
const acct = privateKeyToAccount(raw.startsWith("0x") ? raw : `0x${raw}`);
const chain = defineChain({ id: 50383, name: "hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: ["https://api.hideki2.infra.testnet.somnia.network"] } } });
const c = createPublicClient({ chain, transport: http() }), w = createWalletClient({ account: acct, chain, transport: http() });
const POOL = "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394", USD = "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72";
const BUILDER = process.argv[2], FEE = BigInt(process.argv[3] ?? 10000), GO = process.argv.includes("--go");
const abi = parseAbi([
  "function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)",
  "function approveBuilder(address builder, uint256 maxFeeBpsTimes1k)", "function getBuilderApproval(address user, address builder) view returns (uint256)", "function getMaxBuilderFeeBpsTimes1k() view returns (uint256)",
  "function getWithdrawableBalance(address owner, address token) view returns (uint256)", "function withdraw(address token, uint256 amount)", "function deposit(address token, uint256 amount)",
  "event BuilderFeeCharged(uint128 indexed orderId, address indexed builder, address indexed token, uint256 amount)",
]);
const erc = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const mbAbi = parseAbi(["function getAccountBalance(address) view returns (uint256)", "function unlockedCollateralBalance(address) view returns (uint256)"]);
const rd = (fn, args) => c.readContract({ address: POOL, abi, functionName: fn, args }).catch((e) => `ERR ${String(e.shortMessage).slice(0, 60)}`);
const snap = async (tag) => {
  const v = { poolVaultBuilder: await rd("getWithdrawableBalance", [BUILDER, USD]), builderWallet: await c.readContract({ address: USD, abi: erc, functionName: "balanceOf", args: [BUILDER] }), mbUSD: await c.readContract({ address: USD, abi: erc, functionName: "balanceOf", args: [MB] }), poolUSD: await c.readContract({ address: USD, abi: erc, functionName: "balanceOf", args: [POOL] }) };
  console.log(tag, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === "bigint" ? formatUnits(x, 18) : x])));
};
console.log("cap", String(await rd("getMaxBuilderFeeBpsTimes1k", [])), "approval", String(await rd("getBuilderApproval", [acct.address, BUILDER])));
await snap("before");
if (!GO) process.exit(0);
const send = async (name, functionName, args) => { const hash = await w.writeContract({ address: POOL, abi, functionName, args, gas: 10000000n }); const r = await c.waitForTransactionReceipt({ hash }); console.log(name, hash, r.status, "gas", String(r.gasUsed)); return r; };
await send("approveBuilder", "approveBuilder", [BUILDER, FEE]);
console.log("approval now", String(await rd("getBuilderApproval", [acct.address, BUILDER])));
const exp = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1000000000n, ZERO = "0x0000000000000000000000000000000000000000";
const px = BigInt(process.argv[4] ?? "2290") * 10n ** 18n, sellPx = BigInt(process.argv[5] ?? "2230") * 10n ** 18n;
const ev = (r) => { for (const l of r.logs) { try { const d = decodeEventLog({ abi, data: l.data, topics: l.topics }); if (d.eventName === "BuilderFeeCharged") console.log("  BuilderFeeCharged", l.address, formatUnits(d.args.amount, 18), d.args.token); } catch {} } console.log("  logs", r.logs.length); };
const r1 = await send("open with builder", "placeOrder", [true, 0n, px, 4000000000000000n, exp, 2, 0, BUILDER, FEE]); ev(r1);
await snap("after open");
const r2 = await send("close with builder", "placeOrder", [false, 0n, sellPx, 4000000000000000n, exp, 2, 0, BUILDER, FEE]); ev(r2);
await snap("after close");
const b = await rd("getWithdrawableBalance", [BUILDER, USD]);
console.log("simulate builder withdraw of", String(b));
if (typeof b === "bigint" && b > 0n) { try { await c.simulateContract({ account: BUILDER, address: POOL, abi, functionName: "withdraw", args: [USD, b] }); console.log("withdraw simulation ok"); } catch (e) { const d = e?.walk?.((x) => typeof x?.data === "string")?.data ?? ""; console.log("withdraw revert", d.slice(0, 74), String(e.shortMessage).slice(0, 100)); } }
