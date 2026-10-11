"use client"

import { useState } from "react"
import { decodeFunctionResult, encodeFunctionData } from "viem"

import { call, connect, mined, onNetwork, provider, send } from "@/components/vault/wallet"
import { Button } from "@/components/ui/button"
import { formatUnitsShort } from "@/lib/token"
import { proofOf, VAULT_ABI } from "@/lib/vault"
import { cn } from "@/lib/utils"

// Where a holder takes their reward. The wallet's lines are found in the public list, in this
// browser: the server is never asked about a wallet, so it does not learn who is looking. Whether
// a line was already claimed is asked of the chain through the wallet, and a claim is a
// transaction the wallet sends itself.

type Month = { period: string; id: number; list: [string, string][] }
type Vault = {
  live: boolean
  chainId: number
  vault: `0x${string}`
  reward: { symbol: string; decimals: number }
  months: Month[]
}
// "unknown": there is no wallet in this browser to ask the chain whether the line was taken.
type Mine = { month: Month; index: number; amount: bigint; state: "open" | "claimed" | "sending" | "failed" | "unknown" }

const FIELD =
  "w-full rounded-lg bg-secondary px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"

export function ClaimPanel({ live }: { live: boolean }) {
  const [wallet, setWallet] = useState("")
  const [vault, setVault] = useState<Vault | null>(null)
  const [mine, setMine] = useState<Mine[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)

  async function useWallet() {
    setNote(null)
    const eth = provider()
    if (!eth) {
      setNote({ text: "No wallet was found in this browser. Type the wallet's address to see what is waiting for it.", bad: true })
      return
    }
    try {
      const account = await connect(eth)
      if (account) {
        setWallet(account)
        await look(account)
      }
    } catch {
      setNote({ text: "The wallet did not hand over an address.", bad: true })
    }
  }

  // Finds the wallet's lines in every funded month, and asks the chain which were taken.
  async function look(address: string) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setNote({ text: "That is not a wallet address.", bad: true })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const response = await fetch("/api/vault/months", { cache: "no-store" })
      const body = (await response.json()) as Vault
      setVault(body)
      const who = address.toLowerCase()
      const found: Mine[] = []
      for (const month of body.months ?? []) {
        const index = month.list.findIndex(([listed]) => listed.toLowerCase() === who)
        if (index < 0) continue
        found.push({ month, index, amount: BigInt(month.list[index][1]), state: "open" })
      }

      const eth = provider()
      if (!eth) for (const line of found) line.state = "unknown"
      if (eth && body.live) {
        for (const line of found) {
          const answer = await call(
            eth,
            body.vault,
            encodeFunctionData({ abi: VAULT_ABI, functionName: "hasClaimed", args: [line.month.id, address as `0x${string}`] })
          ).catch(() => null)
          if (answer && decodeFunctionResult({ abi: VAULT_ABI, functionName: "hasClaimed", data: answer })) line.state = "claimed"
        }
      }
      setMine(found)
    } catch {
      setNote({ text: "The list could not be loaded. Try again.", bad: true })
    } finally {
      setBusy(false)
    }
  }

  async function claim(line: Mine) {
    const eth = provider()
    if (!eth || !vault) {
      setNote({ text: "A claim is a transaction, so it needs a wallet in this browser.", bad: true })
      return
    }
    const mark = (state: Mine["state"]) =>
      setMine((all) => (all ?? []).map((other) => (other.month.id === line.month.id ? { ...other, state } : other)))
    mark("sending")
    setNote(null)
    try {
      await onNetwork(eth, vault.chainId)
      const from = (await connect(eth)) ?? wallet
      const lines = line.month.list.map(([listed, amount]) => ({ wallet: listed as `0x${string}`, amount: BigInt(amount) }))
      const data = encodeFunctionData({
        abi: VAULT_ABI,
        functionName: "claim",
        args: [line.month.id, wallet as `0x${string}`, line.amount, proofOf(line.month.id, lines, line.index)],
      })
      const hash = await send(eth, from, vault.vault, data)
      const done = await mined(eth, hash)
      mark(done ? "claimed" : "failed")
      setNote(
        done
          ? { text: `Claimed. The ${vault.reward.symbol} is in the wallet.`, bad: false }
          : { text: "The transaction did not go through. Nothing was claimed.", bad: true }
      )
    } catch {
      mark("open")
      setNote({ text: "Nothing was sent, so nothing was claimed.", bad: true })
    }
  }

  const symbol = vault?.reward?.symbol ?? "NVDA"
  const decimals = vault?.reward?.decimals ?? 18

  return (
    <div>
      <fieldset disabled={!live || busy} className="space-y-4 disabled:opacity-60">
        <label className="block">
          <span className="label-mono text-muted-foreground">The wallet that holds the token</span>
          <span className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={wallet}
              onChange={(event) => setWallet(event.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className={cn(FIELD, "flex-1")}
            />
            <Button type="button" variant="secondary" onClick={useWallet} className="h-auto min-h-11">
              Use my wallet
            </Button>
          </span>
        </label>
        <Button type="button" size="lg" disabled={!/^0x[0-9a-fA-F]{40}$/.test(wallet)} onClick={() => look(wallet)}>
          {busy ? "Looking" : "See what is waiting"}
        </Button>
      </fieldset>

      <p aria-live="polite" className={cn("mt-4 min-h-6 text-sm leading-snug", note?.bad ? "text-destructive" : "text-foreground")}>
        {note?.text}
      </p>

      {mine ? (
        mine.length === 0 ? (
          <p className="mt-2 rounded-lg bg-secondary px-5 py-4 leading-relaxed text-muted-foreground">
            This wallet is on no month&apos;s list. A wallet is listed for a month when it held the minimum from the
            first block of the month to the last.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {mine.map((line) => (
              <li
                key={line.month.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg bg-secondary px-5 py-4"
              >
                <span>
                  <span className="label-mono block text-muted-foreground">{line.month.period}</span>
                  <span className="mt-1 block font-mono text-xl font-medium tracking-[-0.03em]">
                    {formatUnitsShort(line.amount, decimals)} {symbol}
                  </span>
                </span>
                {line.state === "claimed" ? (
                  <span className="label-mono rounded-md bg-foreground/10 px-2.5 py-1.5">Claimed</span>
                ) : line.state === "unknown" ? (
                  <span className="label-mono text-muted-foreground">Open this page with the wallet to claim</span>
                ) : (
                  <Button type="button" disabled={line.state === "sending"} onClick={() => claim(line)}>
                    {line.state === "sending" ? "Waiting for the wallet" : line.state === "failed" ? "Try again" : "Claim"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
