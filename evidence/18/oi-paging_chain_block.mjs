// Read-only: OpenInterestUpdated logs of one pool in one block, plus getOpenInterest() at that block.
import { createPublicClient, http, parseAbiItem } from "viem";
const c = createPublicClient({ transport: http("https://api.hideki2.infra.testnet.somnia.network") });
const [pool, blk] = [process.argv[2], BigInt(process.argv[3])];
const chainId = await c.getChainId();
const b = await c.getBlock({ blockNumber: blk });
const logs = await c.getLogs({ address: pool, event: parseAbiItem("event OpenInterestUpdated(uint256 openInterest)"), fromBlock: blk, toBlock: blk });
console.log(JSON.stringify({ at: new Date().toISOString(), chainId, block: String(blk), blockTimestamp: String(b.timestamp) }));
for (const l of logs) console.log(`  logIndex ${l.logIndex} tx ${l.transactionHash} openInterest ${l.args.openInterest}`);
try { const oi = await c.readContract({ address: pool, abi: [parseAbiItem("function getOpenInterest() view returns (uint256)")], functionName: "getOpenInterest", blockNumber: blk }); console.log(`  getOpenInterest() at end of block ${blk}: ${oi}`); } catch (e) { console.log("  getOpenInterest at block failed:", e.shortMessage ?? e.message); }
