#!/bin/sh
# What the site needs from the server it runs on, checked from inside the site's own container.
# Run it after the first start, and again after changing .env:
#
#   sh deploy/preflight.sh
#
# It reads and asks; it changes nothing and prints no secret. It matters because some networks
# answer for a host with an address of their own: the site then starts, looks fine, and cannot
# price an order (both price sources have to answer) or count a month (the token's network).
set -eu

${COMPOSE:-docker compose} exec -T app node -e '
const ask = (url, init) =>
  fetch(url, { signal: AbortSignal.timeout(10000), ...init }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ failed: (e.cause && e.cause.code) || e.name }));
const rpc = (url, method) => ask(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }) });
let bad = 0;
const line = (ok, name, detail) => { if (!ok) bad++; console.log((ok ? "ok    " : "FAIL  ") + name + (detail ? "  | " + detail : "")); };
const note = (name, detail) => console.log("note  " + name + "  | " + detail);

(async () => {
  const health = await ask("http://127.0.0.1:3000/api/health");
  line(health.status === 200, "the site answers", health.failed || "http " + health.status);

  const secret = process.env.OWNER_SECRET || "";
  line(secret.length >= 32, "OWNER_SECRET", secret.length >= 32 ? "set" : "missing or shorter than 32 characters: the owner screens stay switched off");

  const kraken = await ask("https://api.kraken.com/0/public/Ticker?pair=ZECUSD");
  const k = kraken.body && kraken.body.result ? Number(Object.values(kraken.body.result)[0].c[0]) : NaN;
  line(k > 0, "price source 1 (Kraken)", kraken.failed ? "no answer: " + kraken.failed : k > 0 ? "$" + k : "http " + kraken.status);
  const coinbase = await ask("https://api.coinbase.com/v2/prices/ZEC-USD/spot");
  const c = coinbase.body && coinbase.body.data ? Number(coinbase.body.data.amount) : NaN;
  line(c > 0, "price source 2 (Coinbase)", coinbase.failed ? "no answer: " + coinbase.failed : c > 0 ? "$" + c : "http " + coinbase.status);
  if (k > 0 && c > 0) {
    const gap = Math.abs(k - c) / Math.min(k, c);
    line(gap <= 0.02, "the two prices agree", (gap * 100).toFixed(2) + "% apart (an order needs 2% or less)");
  } else {
    console.log("      without both prices no order can be placed");
  }

  const address = (process.env.TOKEN_ADDRESS || "").trim();
  if (!address) note("TOKEN_ADDRESS", "empty: the site says there is no token");
  else line(/^0x[0-9a-fA-F]{40}$/.test(address), "TOKEN_ADDRESS", /^0x[0-9a-fA-F]{40}$/.test(address) ? address : "not a 0x address of 40 hex digits: the site reads it as no address");

  const want = Number(process.env.TOKEN_CHAIN_ID || 4663);
  const url = (process.env.TOKEN_RPC_URL || "").trim() || "https://rpc.mainnet.chain.robinhood.com";
  const chain = await rpc(url, "eth_chainId");
  const got = chain.body && chain.body.result ? Number(chain.body.result) : NaN;
  const vault = (process.env.VAULT_ADDRESS || "").trim();
  // Only the vault reads the chain. Until it is switched on, an endpoint that does not answer is
  // worth knowing about and stops nothing.
  if (vault) line(got === want, "the token network (" + want + ")", chain.failed ? "no answer: " + chain.failed : "the endpoint answers for network " + got);
  else note("the token network (" + want + ")", (chain.failed ? "no answer: " + chain.failed : got === want ? "reachable" : "the endpoint answers for network " + got) + ". Not needed until VAULT_ADDRESS is set");
  if (!vault) note("VAULT_ADDRESS", "empty: the reward is switched off");

  console.log(bad ? "\n" + bad + " thing(s) to fix before taking orders." : "\nAll of it answers.");
  process.exit(bad ? 1 : 0);
})();
'
