// SIWE login with a fresh random key held in memory only; prints only status codes and bodies of public-shaped data.
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
export async function login({ base, domain, uri, chainId, key }) {
  const acct = privateKeyToAccount(key ?? generatePrivateKey());
  const n = await (await fetch(`${base}/auth/nonce`, { headers: { "user-agent": "Mozilla/5.0" } })).json();
  const issued = new Date().toISOString();
  const message = `${domain} wants you to sign in with your Ethereum account:\n${acct.address}\n\nSign in to dreamDEX\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${n.nonce}\nIssued At: ${issued}`;
  const signature = await acct.signMessage({ message });
  const r = await fetch(`${base}/auth/login`, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" }, body: JSON.stringify({ message, signature }) });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, token: body.token, expiresAt: body.expiresAt, err: body.name, desc: body.description, address: acct.address, message, signature, acct };
}
