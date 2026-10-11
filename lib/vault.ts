import { concat, encodeAbiParameters, keccak256, parseAbi } from "viem"

// The vault: how holders of the token are rewarded (CONTRACT.md). A wallet earns by the lot: the
// minimum held through a whole hour is one lot, twice the minimum is two. Each lot earns that
// hour, at most the rate the vault's contract carries and never more than the owner has put in. After each hour the site works out what every wallet has earned
// since the vault began and signs the root of that list; a wallet claims what it has earned and
// not yet taken from the contract, whenever it likes.
//
// This file is the part with no database, no network and no key in it: how an hour is counted
// from the token's transfers, how much it pays, and how the list is hashed into the root the
// contract checks claims against. Everything here is done from public data, so anyone can do the
// same sums and check a root.

// ---------------------------------------------------------------- hours

export const HOUR = 3600

// An hour by its number: hours since 1970, in UTC. Hour h runs from h * 3600 up to, and not
// including, (h + 1) * 3600.
export const hourOf = (seconds: number) => Math.floor(seconds / HOUR)
export const hourStart = (hour: number) => hour * HOUR
export const hourEnd = (hour: number) => (hour + 1) * HOUR

// "2026-10-12 14:00 UTC": an hour as people read it.
export const hourLabel = (hour: number) => `${new Date(hour * HOUR * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`

// ---------------------------------------------------------------- counting

// One movement of the token, as the chain reports it.
export type Transfer = { from: string; to: string; value: bigint; block: bigint; index: number }

const inOrder = (transfers: Transfer[]) =>
  [...transfers].sort((a, b) => (a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1))

// Balances after a stretch of transfers, from the balances before it. Wallets left with nothing
// are dropped.
export function balancesAfter(before: Map<string, bigint>, transfers: Transfer[]) {
  const balance = new Map(before)
  for (const transfer of inOrder(transfers)) {
    const from = transfer.from.toLowerCase()
    const to = transfer.to.toLowerCase()
    balance.set(from, (balance.get(from) ?? 0n) - transfer.value)
    balance.set(to, (balance.get(to) ?? 0n) + transfer.value)
  }
  for (const [wallet, held] of balance) if (held === 0n) balance.delete(wallet)
  return balance
}

// The wallets that held at least one lot through a whole hour, each with how many whole lots it
// held, from the balances going into the hour and the hour's transfers. A wallet counts with the
// lowest balance it had: one that dipped under a lot at any moment is out for that hour, and one
// that arrived during the hour started it with nothing. Holding at one counted block could be met
// by buying just before it and selling just after; the lowest balance of the hour cannot.
//
// Wallets in `skip` are never listed: addresses that could not claim, such as the pool the token
// trades in, and the vault itself.
export function lotsThrough(before: Map<string, bigint>, transfers: Transfer[], lot: bigint, skip: string[] = []) {
  const balance = new Map(before)
  const lowest = new Map(before)
  const move = (wallet: string, by: bigint) => {
    const who = wallet.toLowerCase()
    const after = (balance.get(who) ?? 0n) + by
    balance.set(who, after)
    const floor = lowest.get(who) ?? 0n
    if (after < floor) lowest.set(who, after)
  }
  for (const transfer of inOrder(transfers)) {
    move(transfer.from, -transfer.value)
    move(transfer.to, transfer.value)
  }
  const out = new Set(skip.map((wallet) => wallet.toLowerCase()))
  return [...lowest]
    .filter(([wallet, held]) => held >= lot && !out.has(wallet))
    .map(([wallet, held]): [`0x${string}`, number] => [wallet as `0x${string}`, Number(held / lot)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

// ---------------------------------------------------------------- what an hour pays

// The rate as the vault's contract carried it: each time it was set, when that was (in seconds)
// and what the ceiling had reached by then. Read from the contract's own events.
export type RateChange = { at: number; rate: bigint; ceiling: bigint }

// The most one lot can have earned by `time`, worked out exactly as the contract works it out
// (ZolaceVault.ceiling). Nothing before the vault began.
export function ceilingAt(changes: RateChange[], time: number) {
  let last: RateChange | null = null
  for (const change of changes) if (change.at <= time && (!last || change.at >= last.at)) last = change
  return last ? last.ceiling + (last.rate * BigInt(time - last.at)) / BigInt(HOUR) : 0n
}

// What one lot earns for an hour at the most: how far the ceiling rose in it.
export const dueFor = (changes: RateChange[], hour: number) => ceilingAt(changes, hourEnd(hour)) - ceilingAt(changes, hourStart(hour))

// What each lot earns for an hour: the rate, or less when what the owner has put in does not
// cover the rate for every lot. Then what is left is shared evenly, rounded down, so the list
// never promises more than the vault was given.
export function shareOf(due: bigint, lots: number, available: bigint) {
  if (lots <= 0 || due <= 0n || available <= 0n) return 0n
  const even = available / BigInt(lots)
  return even < due ? even : due
}

// The rate that stands for an amount of dollar cents an hour at a price of the reward: how many
// of the reward's smallest units one lot earns in an hour. `price` is in dollars, as typed ("172.40").
// Null when the price is not a positive amount.
export function rateFor(cents: bigint, price: string, decimals: number) {
  const match = /^(\d{1,9})(?:\.(\d{1,6}))?$/.exec(price.trim())
  if (!match) return null
  const millionths = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0") || "0")
  if (millionths === 0n) return null
  return (cents * 10n ** BigInt(decimals) * 1_000_000n) / (100n * millionths)
}

// Wallet addresses as the owner types them, apart by spaces, commas or lines. Null when one of
// them is not an address: a mistyped wallet must not be passed over in silence.
export function parseWallets(text: string): `0x${string}`[] | null {
  const words = text.split(/[\s,;]+/).filter(Boolean)
  if (words.some((word) => !/^0x[0-9a-fA-F]{40}$/.test(word))) return null
  return [...new Set(words.map((word) => word.toLowerCase() as `0x${string}`))]
}

// ---------------------------------------------------------------- the list, hashed

type Hash = `0x${string}`

export type Line = { wallet: `0x${string}`; amount: bigint }

// The list as it is hashed: every wallet that has earned anything, with all it has earned since
// the vault began, in the order of the addresses.
export function linesOf(earned: Map<string, bigint>): Line[] {
  return [...earned]
    .filter(([, amount]) => amount > 0n)
    .map(([wallet, amount]) => ({ wallet: wallet.toLowerCase() as `0x${string}`, amount }))
    .sort((a, b) => (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0))
}

// One line of a list, hashed the way the contract hashes it (ZolaceVault.leafOf): the wallet and
// the amount, hashed twice.
export function leafOf(wallet: `0x${string}`, amount: bigint): Hash {
  return keccak256(keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [wallet, amount])))
}

// Two hashes into one. The smaller goes first, so a proof does not have to say left or right.
const pair = (a: Hash, b: Hash): Hash => keccak256(concat(BigInt(a) < BigInt(b) ? [a, b] : [b, a]))

// The layers of the tree over a list's lines, from the hashed lines up to the root. An odd hash
// at the end of a layer is carried up as it is.
function layersOf(lines: Line[]) {
  let layer = lines.map((line) => leafOf(line.wallet, line.amount))
  const layers = [layer]
  while (layer.length > 1) {
    const next: Hash[] = []
    for (let at = 0; at < layer.length; at += 2) {
      next.push(at + 1 < layer.length ? pair(layer[at], layer[at + 1]) : layer[at])
    }
    layers.push(next)
    layer = next
  }
  return layers
}

// The root of a list: the one hash the signer signs. An empty list has none.
export function rootOf(lines: Line[]): Hash | null {
  if (lines.length === 0) return null
  return layersOf(lines).at(-1)![0]
}

// The hashes that tie one line to the root: what a wallet sends along when it claims.
export function proofOf(lines: Line[], index: number): Hash[] {
  const proof: Hash[] = []
  let at = index
  for (const layer of layersOf(lines).slice(0, -1)) {
    const sibling = at % 2 === 0 ? at + 1 : at - 1
    if (sibling < layer.length) proof.push(layer[sibling])
    at = Math.floor(at / 2)
  }
  return proof
}

// What the contract does with a proof, done here: whether a line belongs under a root.
export function onTheList(root: Hash, wallet: `0x${string}`, amount: bigint, proof: Hash[]) {
  return proof.reduce((hash, sibling) => pair(hash, sibling), leafOf(wallet, amount)) === root
}

// What the signer signs for a list (ZolaceVault.listHash): the hour it runs to and its root, bound
// to one vault on one network, so a signature is good nowhere else.
export function listToSign(chainId: number, vault: `0x${string}`, hour: number, root: Hash) {
  return {
    domain: { name: "Zolace Vault", version: "1", chainId, verifyingContract: vault },
    types: {
      List: [
        { name: "hour", type: "uint64" },
        { name: "root", type: "bytes32" },
      ],
    },
    primaryType: "List",
    message: { hour: BigInt(hour), root },
  } as const
}

// ---------------------------------------------------------------- the contracts

// The parts of the vault's contract the site reads, or lets a wallet call (ZolaceVault.sol).
export const VAULT_ABI = parseAbi([
  "function signer() view returns (address)",
  "function rate() view returns (uint256)",
  "function lots() view returns (uint256)",
  "function ceiling() view returns (uint256)",
  "function claimed(address account) view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function claim(address account, uint256 earned, uint64 hour, bytes32 root, bytes signature, bytes32[] proof)",
  "function setRate(uint256 newRate)",
  "function setSigner(address newSigner)",
  "event RateSet(uint256 rate, uint256 ceiling)",
])

// What the owner's wallet is asked of the reward's token to put it into the vault. The vault is
// funded by a plain transfer to its address.
export const REWARD_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
])
