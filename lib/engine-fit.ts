// Whether the payment engine can still read the chain it watches.
//
// The engine reads each transaction with the rules of the network upgrade the transaction was
// made under. A transaction of an upgrade the engine's build does not know is dropped without an
// error and without a line in its log: its health stays "ok" and a buyer's payment is simply not
// seen (PLAN.md, "Stage 0: what was run": that is how the first payment on testnet was lost).
//
// The chain explorer the engine reads says which upgrade the chain is on and which ones are
// scheduled. This file holds that against the upgrades the engine was built for. When the chain
// is on one the engine cannot read, the shop starts no order (lib/cipherpay.ts, healthy) and the
// owner is told (lib/owner-notify.ts); when one is scheduled, the owner is told ahead of it.
//
// It catches that one failure, the one that was seen. A payment the engine misses for another
// reason is still not noticed by anything here.

// The upgrades the engine's build can read, by the consensus branch each one has. This has to
// match engine/cipherpay/: its nu7.patch moved the engine to Zcash libraries that know NU7. When
// the engine is rebuilt for a later upgrade, add that upgrade's branch here.
export const ENGINE_READS: Record<string, string> = {
  "37a5165b": "NU6.3",
  "77190ad9": "NU7",
}

export type Fit =
  // The chain is on an upgrade the engine reads, and none it cannot read is scheduled.
  | { state: "fits"; upgrade: string }
  // The chain is on an upgrade the engine reads; one it cannot read is scheduled for a block.
  | { state: "ahead"; upgrade: string; next: string; atBlock: number; blocksLeft: number }
  // The chain is on an upgrade the engine cannot read: payments are not seen.
  | { state: "unread"; upgrade: string }
  // The explorer did not answer, or answered with something that could not be used.
  | { state: "unknown" }

type Upgrade = { name?: unknown; activationheight?: unknown; status?: unknown }

// What the explorer's answer means for the engine.
export function fitOf(info: unknown): Fit {
  const body = info as { blocks?: unknown; consensus?: { chaintip?: unknown; nextblock?: unknown }; upgrades?: Record<string, Upgrade> } | null
  const tip = body?.consensus?.chaintip
  const next = body?.consensus?.nextblock
  const upgrades = body?.upgrades
  if (typeof tip !== "string" || typeof next !== "string" || !upgrades || typeof upgrades !== "object") return { state: "unknown" }
  const nameOf = (branch: string) => (typeof upgrades[branch]?.name === "string" ? (upgrades[branch].name as string) : branch)

  // The next block is the one a payment made now lands in.
  for (const branch of [next, tip]) {
    if (!(branch in ENGINE_READS)) return { state: "unread", upgrade: nameOf(branch) }
  }

  const height = Number(body?.blocks)
  let ahead: { next: string; atBlock: number } | null = null
  for (const [branch, upgrade] of Object.entries(upgrades)) {
    const at = Number(upgrade?.activationheight)
    if (branch in ENGINE_READS || !Number.isSafeInteger(at) || !Number.isSafeInteger(height) || at <= height) continue
    if (!ahead || at < ahead.atBlock) ahead = { next: nameOf(branch), atBlock: at }
  }
  if (ahead) return { state: "ahead", upgrade: nameOf(next), next: ahead.next, atBlock: ahead.atBlock, blocksLeft: ahead.atBlock - height }
  return { state: "fits", upgrade: nameOf(next) }
}

// The explorer is asked at most this often. An upgrade is known days ahead and takes effect at
// one block, so a few minutes of delay let through at most the orders of those minutes.
const FRESH_MS = 3 * 60 * 1000
// An answer that could be used is kept this long when the explorer stops answering.
const KEPT_MS = 60 * 60 * 1000
const asked = new Map<string, { at: number; fit: Fit }>()

// For the tests: the next question is really asked.
export const forgetFit = () => asked.clear()

export async function engineFit(scanUrl: string, now = Date.now()): Promise<Fit> {
  const last = asked.get(scanUrl)
  if (last && now >= last.at && now - last.at < FRESH_MS) return last.fit
  let fit: Fit = { state: "unknown" }
  try {
    const response = await fetch(`${scanUrl}/api/blockchain-info`, { signal: AbortSignal.timeout(8000), cache: "no-store" })
    if (response.ok) fit = fitOf(await response.json().catch(() => null))
  } catch {
    // No answer: unknown.
  }
  if (fit.state === "unknown") {
    // What was last known still stands for a while: an explorer that is briefly silent does not
    // switch an alarm off, or on.
    return last && now - last.at < KEPT_MS ? last.fit : fit
  }
  asked.set(scanUrl, { at: now, fit })
  return fit
}

// Roughly how long until a block that many blocks away: a Zcash block takes about 75 seconds.
export function aboutUntil(blocksLeft: number) {
  const hours = (blocksLeft * 75) / 3600
  if (hours < 1) return "under an hour"
  if (hours < 48) return `about ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`
  return `about ${Math.round(hours / 24)} days`
}
