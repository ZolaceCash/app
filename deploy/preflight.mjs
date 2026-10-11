// What the site needs from the server it runs on, checked from inside the site's own container.
// It is copied into the image, so it runs wherever the site runs:
//
//   sh deploy/preflight.sh                  (Docker Compose on a server)
//   node preflight.mjs                      (a terminal inside the container, as Coolify gives one)
//
// It reads and asks; it changes nothing and prints no secret. It matters because some networks
// answer for a host with an address of their own: the site then starts, looks fine, and cannot
// price an order (both price sources have to answer) or count a month (the token's network).

const ask = (url, init) =>
  fetch(url, { signal: AbortSignal.timeout(10000), ...init })
    .then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }))
    .catch((error) => ({ failed: error.cause?.code ?? error.name }))
const rpc = (url, method) =>
  ask(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }) })

let bad = 0
const line = (ok, name, detail) => {
  if (!ok) bad++
  console.log(`${ok ? "ok    " : "FAIL  "}${name}${detail ? "  | " + detail : ""}`)
}
const note = (name, detail) => console.log(`note  ${name}  | ${detail}`)

const health = await ask(`http://127.0.0.1:${process.env.PORT || 3000}/api/health`)
line(health.status === 200, "the site answers", health.failed ?? `http ${health.status}`)

const secret = process.env.OWNER_SECRET ?? ""
line(secret.length >= 32, "OWNER_SECRET", secret.length >= 32 ? "set" : "missing or shorter than 32 characters: the owner's screens stay switched off")

const kraken = await ask("https://api.kraken.com/0/public/Ticker?pair=ZECUSD")
const k = kraken.body?.result ? Number(Object.values(kraken.body.result)[0].c[0]) : NaN
line(k > 0, "price source 1 (Kraken)", kraken.failed ? `no answer: ${kraken.failed}` : k > 0 ? `$${k}` : `http ${kraken.status}`)
const coinbase = await ask("https://api.coinbase.com/v2/prices/ZEC-USD/spot")
const c = coinbase.body?.data ? Number(coinbase.body.data.amount) : NaN
line(c > 0, "price source 2 (Coinbase)", coinbase.failed ? `no answer: ${coinbase.failed}` : c > 0 ? `$${c}` : `http ${coinbase.status}`)
if (k > 0 && c > 0) {
  const gap = Math.abs(k - c) / Math.min(k, c)
  line(gap <= 0.02, "the two prices agree", `${(gap * 100).toFixed(2)}% apart (an order needs 2% or less)`)
} else {
  console.log("      without both prices no order can be placed")
}

// Payments: which engine the site would use right now, and whether that engine is fit.
const network = (process.env.PAYMENT_NETWORK ?? "").trim()
const engineUrl = (process.env.CIPHERPAY_URL ?? "").trim().replace(/\/+$/, "")
let engineKey = (process.env.CIPHERPAY_API_KEY ?? "").trim()
if (!engineKey && process.env.CIPHERPAY_API_KEY_FILE) {
  engineKey = await import("node:fs").then((fs) => fs.readFileSync(process.env.CIPHERPAY_API_KEY_FILE, "utf8").trim()).catch(() => "")
}
if (network !== "mainnet" && network !== "testnet") {
  note("payments", `PAYMENT_NETWORK is ${network ? `"${network}", which is neither mainnet nor testnet` : "empty"}: the shop takes test orders only`)
} else if (!engineUrl || !engineKey) {
  line(false, `payments (${network})`, !engineUrl ? "CIPHERPAY_URL is not set" : "the engine has no key on file: was ZCASH_VIEWING_KEY set, and did engine-setup run?")
} else {
  const engine = await ask(`${engineUrl}/api/health`)
  const scanner = engine.body?.checks?.scanner
  line(
    engine.status === 200 && engine.body?.status !== "unhealthy",
    `payments (${network})`,
    engine.failed
      ? `the engine does not answer: ${engine.failed}`
      : `the engine says "${engine.body?.status}"${scanner ? `, ${scanner.blocks_behind} blocks behind` : ""}${engine.body?.status === "unhealthy" ? ". After a start it reads the blocks it missed first; no order is taken until it has" : ""}`
  )
  const made = await ask(`${engineUrl}/api/invoices?limit=1`, { headers: { Authorization: `Bearer ${engineKey}` } })
  line(made.status === 200, "the engine knows the site's key", made.failed ?? `http ${made.status}`)
}

const database = process.env.DATABASE_URL ?? ""
note("the database", database.startsWith("file:") || !database ? `a file on this server (${database || "the default"})` : "a hosted database: the orders are stored with that provider")

const address = (process.env.TOKEN_ADDRESS ?? "").trim()
const valid = /^0x[0-9a-fA-F]{40}$/.test(address)
if (!address) note("TOKEN_ADDRESS", "empty: the site says there is no token")
else line(valid, "TOKEN_ADDRESS", valid ? address : "not a 0x address of 40 hex digits: the site reads it as no address")

const want = Number(process.env.TOKEN_CHAIN_ID || 4663)
const url = (process.env.TOKEN_RPC_URL ?? "").trim() || "https://rpc.mainnet.chain.robinhood.com"
const chain = await rpc(url, "eth_chainId")
const got = chain.body?.result ? Number(chain.body.result) : NaN
const vault = (process.env.VAULT_ADDRESS ?? "").trim()
const heard = chain.failed ? `no answer: ${chain.failed}` : `the endpoint answers for network ${got}`
// Only the vault reads the chain. Until it is switched on, an endpoint that does not answer is
// worth knowing about and stops nothing.
if (vault) line(got === want, `the token's network (${want})`, heard)
else note(`the token's network (${want})`, `${got === want ? "reachable" : heard}. Not needed until VAULT_ADDRESS is set`)
if (!vault) note("VAULT_ADDRESS", "empty: the reward is switched off")
else {
  // The key is checked for its shape only. It is never printed.
  const key = (process.env.VAULT_SIGNER_KEY ?? "").trim()
  line(/^0x[0-9a-fA-F]{64}$/.test(key), "VAULT_SIGNER_KEY", key ? (/^0x[0-9a-fA-F]{64}$/.test(key) ? "set" : "not a key: 0x and 64 hex digits") : "empty: no list is signed, so nobody can claim")
}

console.log(bad ? `\n${bad} thing(s) to fix before taking orders.` : "\nAll of it answers.")
process.exit(bad ? 1 : 0)
