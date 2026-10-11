// Checking an address a buyer gives for a refund. A refund is sent by hand and cannot be called
// back, so a mistyped address must be caught here: every Zcash address carries a checksum, and one
// wrong character breaks it.
//
// Only shielded addresses are taken: a unified address (u1...) or a Sapling one (zs1...). A
// transparent address would put the refund, and so the order, in public.

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
// The two checksums in use: Sapling addresses use the first (Bech32), unified ones the second (Bech32m).
const BECH32 = 1
const BECH32M = 0x2bc830a3

function polymod(values: number[]) {
  let check = 1
  for (const value of values) {
    const top = check >>> 25
    check = ((check & 0x1ffffff) << 5) ^ value
    for (let bit = 0; bit < 5; bit++) if ((top >>> bit) & 1) check ^= GENERATOR[bit]
  }
  return check >>> 0
}

// The part of the checksum's input that comes from the prefix.
const expand = (prefix: string) => [...[...prefix].map((c) => c.charCodeAt(0) >>> 5), 0, ...[...prefix].map((c) => c.charCodeAt(0) & 31)]

// The checksum an address was written with, or null when it has none that holds.
function checksumOf(address: string): { prefix: string; kind: number } | null {
  const at = address.lastIndexOf("1")
  if (at < 1 || address.length - at - 1 < 7) return null
  const prefix = address.slice(0, at)
  const data = [...address.slice(at + 1)].map((c) => CHARSET.indexOf(c))
  if (data.some((value) => value < 0)) return null
  const kind = polymod([...expand(prefix), ...data])
  return kind === BECH32 || kind === BECH32M ? { prefix, kind } : null
}

// Which prefixes belong to which network, and which checksum each kind of address uses.
const ACCEPTED: Record<"mainnet" | "testnet", Record<string, number>> = {
  mainnet: { u: BECH32M, zs: BECH32 },
  testnet: { utest: BECH32M, ztestsapling: BECH32 },
}

// The address, tidied, when it is a shielded address of that network whose checksum holds. Null
// otherwise. An address in capitals is taken too: the format allows either, never a mix.
export function shieldedAddress(text: string, network: "mainnet" | "testnet"): string | null {
  const typed = text.trim()
  if (typed.length < 20 || typed.length > 600) return null
  if (typed !== typed.toLowerCase() && typed !== typed.toUpperCase()) return null
  const address = typed.toLowerCase()
  const found = checksumOf(address)
  if (!found) return null
  return ACCEPTED[network][found.prefix] === found.kind ? address : null
}

// An address as it is shown back to whoever holds the order's link: enough to recognise it, not
// enough to learn it.
export const maskAddress = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`
