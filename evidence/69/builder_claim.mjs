import { createPublicClient, http, parseAbi, formatUnits } from "viem";
const c = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network") });
const MB = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394", POOL = "0xd6cb1dd58580b84d76068ac21594219ce03aeddf", USD = "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72";
const B = process.argv[2];
const q = await (await fetch("https://hideki-dev.smk.somnia.host/v1/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: `{ PerpFeeRecord(limit:4, order_by:{timestamp:desc}, where:{builder:{_eq:"${B.toLowerCase()}"}}) { kind amount builder account fillNotional txHash } }` }) })).json();
console.log(JSON.stringify(q.data?.PerpFeeRecord ?? q).slice(0, 700));
const abi = parseAbi(["function getAccountSnapshot(address) view returns (uint256)", "function withdraw(uint256 amount)", "function getWithdrawableCollateral(address account) view returns (uint256)", "function unlockedCollateralBalance(address) view returns (uint256)", "function deposit(uint256)"]);
for (const fn of ["getWithdrawableCollateral"]) { try { const v = await c.readContract({ address: MB, abi, functionName: fn, args: [B] }); console.log(fn, formatUnits(v, 18)); } catch (e) { console.log(fn, "ERR", String(e.shortMessage).slice(0, 80)); } }
for (const amt of [18000000000000000n, 18060000000000000n, 10n ** 18n]) { try { await c.simulateContract({ account: B, address: MB, abi, functionName: "withdraw", args: [amt] }); console.log("withdraw", formatUnits(amt, 18), "simulates ok"); } catch (e) { const d = e?.walk?.((x) => typeof x?.data === "string")?.data ?? ""; console.log("withdraw", formatUnits(amt, 18), "revert", d.slice(0, 40), String(e.shortMessage).slice(0, 90)); } }
