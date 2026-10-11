import { privateKeyToAccount } from "viem/accounts"

import { listToSign } from "@/lib/vault"

// The one key the server holds for the token's chain, and what it is for (CONTRACT.md). It signs
// the root of the hourly list, and the vault's contract pays a claim only against a list that
// carries this signature. The key holds no funds and sends no transaction: it never needs ETH,
// and the address it belongs to should hold nothing.
//
// What it can do is still real: whoever has this key can sign a list of their own, and the
// contract would pay it, up to the ceiling for all wallets together. So the key lives in one setting
// (VAULT_SIGNER_KEY), it is never logged or shown, the owner can name another signer in one
// transaction, and the vault should never hold more than the owner is ready to lose.

function account() {
  const key = (process.env.VAULT_SIGNER_KEY ?? "").trim()
  return /^0x[0-9a-fA-F]{64}$/.test(key) ? privateKeyToAccount(key as `0x${string}`) : null
}

// The address the signatures come from: what the vault's contract has to name as its signer.
// Null when no key is set, and then no list is signed and nothing can be claimed.
export const signerAddress = () => account()?.address ?? null

// Signing the same list again gives the same answer, so it is done once.
const signed = new Map<string, `0x${string}`>()

export async function signList(chainId: number, vault: `0x${string}`, hour: number, root: `0x${string}`) {
  const signer = account()
  if (!signer) return null
  const name = `${chainId}:${vault}:${hour}:${root}:${signer.address}`
  const known = signed.get(name)
  if (known) return known
  const signature = await signer.signTypedData(listToSign(chainId, vault, hour, root))
  if (signed.size > 64) signed.clear()
  signed.set(name, signature)
  return signature
}
