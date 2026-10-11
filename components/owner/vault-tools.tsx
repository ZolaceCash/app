"use client"

import { useState } from "react"
import { decodeFunctionResult, encodeFunctionData } from "viem"

import { Button } from "@/components/ui/button"
import { call, connect, mined, onNetwork, provider, send, type Provider } from "@/components/vault/wallet"
import { formatUnitsShort, parseUnitsExact } from "@/lib/token"
import { rateFor, REWARD_ABI, VAULT_ABI } from "@/lib/vault"
import { cn } from "@/lib/utils"

// What the owner does to the vault, each from the owner's own wallet in this browser: put the
// reward in, set the rate, name the signer. The server sends none of these and holds no key that
// could.

type Note = { text: string; bad: boolean } | null
type Made = { to: `0x${string}`; data: `0x${string}`; done: string } | string

const FIELD =
  "w-full rounded-lg bg-secondary px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"

// One transaction from the owner's wallet, and what became of it. `make` says what to send, or
// in a line why nothing is sent.
function useWallet(chainId: number) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)

  async function run(make: (owner: `0x${string}`, eth: Provider) => Promise<Made>) {
    const eth = provider()
    if (!eth) {
      setNote({ text: "No wallet was found in this browser.", bad: true })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      await onNetwork(eth, chainId)
      const owner = await connect(eth)
      if (!owner) throw new Error("no account")
      const made = await make(owner, eth)
      if (typeof made === "string") {
        setNote({ text: made, bad: true })
        return
      }
      const hash = await send(eth, owner, made.to, made.data)
      setNote(
        (await mined(eth, hash))
          ? { text: made.done, bad: false }
          : { text: "The transaction did not go through. Nothing changed.", bad: true }
      )
    } catch {
      setNote({ text: "Nothing was sent, so nothing changed.", bad: true })
    } finally {
      setBusy(false)
    }
  }

  return { busy, note, run }
}

function Said({ note }: { note: Note }) {
  return (
    <p aria-live="polite" className={cn("min-h-5 text-sm leading-snug", note?.bad ? "text-destructive" : "text-muted-foreground")}>
      {note?.text}
    </p>
  )
}

// Puts the reward into the vault: a plain transfer of it to the vault's address. It cannot be
// taken back out.
export function FundVault({
  chainId,
  vault,
  reward,
  symbol,
  decimals,
}: {
  chainId: number
  vault: `0x${string}`
  reward: `0x${string}`
  symbol: string
  decimals: number
}) {
  const [amount, setAmount] = useState("")
  const { busy, note, run } = useWallet(chainId)
  const units = parseUnitsExact(amount, decimals)

  const fund = () =>
    run(async (owner, eth) => {
      if (units === null || units === 0n) return `The amount has to be in ${symbol}, like 0.5.`
      const held = decodeFunctionResult({
        abi: REWARD_ABI,
        functionName: "balanceOf",
        data: await call(eth, reward, encodeFunctionData({ abi: REWARD_ABI, functionName: "balanceOf", args: [owner] })),
      })
      if (held < units) return `This wallet holds ${formatUnitsShort(held, decimals)} ${symbol}, which is less than that.`
      return {
        to: reward,
        data: encodeFunctionData({ abi: REWARD_ABI, functionName: "transfer", args: [vault, units] }),
        done: "Sent. It counts from the hour it arrived in, once that hour is counted.",
      }
    })

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label-mono text-muted-foreground">{symbol} to put in</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value.trim())}
          inputMode="decimal"
          placeholder="0.5"
          autoComplete="off"
          className={cn(FIELD, "mt-2")}
        />
      </label>
      <Button type="button" disabled={busy || units === null || units === 0n} onClick={fund}>
        {busy ? "Waiting for the wallet" : "Send from my wallet"}
      </Button>
      <Said note={note} />
    </div>
  )
}

// Sets the rate: how much of the reward one lot of the token earns in an hour at the most. The owner types
// the reward's price and the rate that stands for the hourly amount at that price is worked out
// here, so what is signed is a number the owner has seen.
export function SetRate({
  chainId,
  vault,
  symbol,
  decimals,
  cents,
}: {
  chainId: number
  vault: `0x${string}`
  symbol: string
  decimals: number
  // The hourly amount in dollar cents, as text: it crosses to the browser.
  cents: string
}) {
  const [price, setPrice] = useState("")
  const { busy, note, run } = useWallet(chainId)
  const rate = rateFor(BigInt(cents), price, decimals)

  const set = () =>
    run(async () => {
      if (rate === null || rate === 0n) return `Type the price of one ${symbol} in dollars, like 172.40.`
      return {
        to: vault,
        data: encodeFunctionData({ abi: VAULT_ABI, functionName: "setRate", args: [rate] }),
        done: "The rate is set. It counts from this moment on.",
      }
    })

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label-mono text-muted-foreground">Price of one {symbol}, in dollars</span>
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value.trim())}
          inputMode="decimal"
          placeholder="172.40"
          autoComplete="off"
          className={cn(FIELD, "mt-2")}
        />
      </label>
      <p className="font-mono text-xs break-all text-muted-foreground">
        {rate === null
          ? "The rate is worked out from the price."
          : `${formatUnitsShort(rate, decimals, decimals)} ${symbol} an hour for each lot (${rate} units)`}
      </p>
      <Button type="button" disabled={busy || rate === null || rate === 0n} onClick={set}>
        {busy ? "Waiting for the wallet" : "Set the rate from my wallet"}
      </Button>
      <Said note={note} />
    </div>
  )
}

// Names the key whose signature makes a list count. Every list signed by the key before it stops
// counting at once.
export function NameSigner({ chainId, vault, signer }: { chainId: number; vault: `0x${string}`; signer: `0x${string}` }) {
  const { busy, note, run } = useWallet(chainId)
  const name = () =>
    run(async () => ({
      to: vault,
      data: encodeFunctionData({ abi: VAULT_ABI, functionName: "setSigner", args: [signer] }),
      done: "The vault now takes lists signed by this server's key.",
    }))

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" disabled={busy} onClick={name}>
        {busy ? "Waiting for the wallet" : "Name this server's key as the signer"}
      </Button>
      <Said note={note} />
    </div>
  )
}
