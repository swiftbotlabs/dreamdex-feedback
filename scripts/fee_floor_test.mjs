// Report 09: three 0-value self-transfers from a funded throwaway testnet key on Hideki (chain 50383):
// legacy at 0.6 gwei, EIP-1559 at 0.6 gwei, EIP-1559 at the reported 6 gwei base fee.
// PRIVATE_KEY=0x... node scripts/fee_floor_test.mjs   (the key is used in-process only; use a throwaway key)
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const RPC = "https://api.hideki2.infra.testnet.somnia.network";
const chain = defineChain({ id: 50383, name: "Hideki", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const k = process.env.PRIVATE_KEY ?? "";
if (!/^(0x)?[0-9a-fA-F]{64}$/.test(k)) { console.error("set PRIVATE_KEY"); process.exit(2); }
const account = privateKeyToAccount(k.startsWith("0x") ? k : "0x" + k);
const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 60_000 }) });
const wal = createWalletClient({ account, chain, transport: http(RPC, { timeout: 60_000 }) });
const [gp, blk] = await Promise.all([pub.getGasPrice(), pub.getBlock()]);
console.log("eth_gasPrice", gp.toString(), "block baseFeePerGas", blk.baseFeePerGas.toString(), "block", blk.number.toString());
let nonce = await pub.getTransactionCount({ address: account.address });
const cases = [
  ["legacy 0.6 gwei", { type: "legacy", gasPrice: 600_000_000n }],
  ["eip1559 maxFee 0.6 gwei", { type: "eip1559", maxFeePerGas: 600_000_000n, maxPriorityFeePerGas: 0n }],
  ["eip1559 maxFee 12 gwei tip 0", { type: "eip1559", maxFeePerGas: 12_000_000_000n, maxPriorityFeePerGas: 0n }],
];
for (const [label, fee] of cases) {
  try {
    const hash = await wal.sendTransaction({ to: account.address, value: 0n, gas: 100_000n, nonce, ...fee });
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 }); nonce++;
    console.log(JSON.stringify({ label, hash, status: r.status, gasUsed: r.gasUsed.toString(), effectiveGasPrice: r.effectiveGasPrice.toString(), costWei: (r.gasUsed * r.effectiveGasPrice).toString(), block: r.blockNumber.toString() }));
  } catch (e) {
    console.log(JSON.stringify({ label, error: (e.shortMessage || e.message).slice(0, 120), details: String(e.details ?? e.cause?.details ?? "").slice(0, 200) }));
  }
}
