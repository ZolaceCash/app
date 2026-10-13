"use client"

import { useState } from "react"
import { decodeFunctionResult, encodeFunctionData } from "viem"

import { call, connect, mined, onNetwork, provider, send } from "@/components/vault/wallet"
import { Button } from "@/components/ui/button"
import { formatUnitsShort } from "@/lib/token"
import { hourLabel, proofOf, VAULT_ABI } from "@/lib/vault"
import { cn } from "@/lib/utils"

// Where a holder takes their reward. The wallet's line is found in the public list, in this
// browser: the server is never asked about a wallet, so it does not learn who is looking. What
// the wallet has already taken is asked of the chain through the wallet, and a claim is a
// transaction the wallet sends itself.

type Vault = {
  live: boolean
  chainId: number
  vault: `0x${string}`
  reward: { symbol: string; decimals: number }
  hour: number | null
  root: `0x${string}` | null
  signature: `0x${string}` | null
  list: [string, string][]
  // Set once the owner has closed the reward: whose line holds everything that was not claimed.
  closed?: { to: string } | null
}
// `taken` is null when there is no wallet in this browser to ask the chain what was taken.
type Mine = { index: number; earned: bigint; taken: bigint | null }

const FIELD =
  "w-full rounded-lg bg-secondary px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"

export function ClaimPanel({ live }: { live: boolean }) {
  const [wallet, setWallet] = useState("")
  const [vault, setVault] = useState<Vault | null>(null)
  // Undefined before a wallet was looked up; null when it is not on the list.
  const [mine, setMine] = useState<Mine | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)

  async function useWallet() {
    setNote(null)
    const eth = provider()
    if (!eth) {
      setNote({ text: "No wallet was found in this browser. Type the wallet's address to see what it has earned.", bad: true })
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

  // Finds the wallet's line in the list, and asks the chain what it has taken so far.
  async function look(address: string) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setNote({ text: "That is not a wallet address.", bad: true })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const response = await fetch("/api/vault/list", { cache: "no-store" })
      const body = (await response.json()) as Vault
      setVault(body)
      const who = address.toLowerCase()
      const index = (body.list ?? []).findIndex(([listed]) => listed.toLowerCase() === who)
      if (index < 0) {
        setMine(null)
        return
      }

      let taken: bigint | null = null
      const eth = provider()
      if (eth && body.live) {
        // A wallet answers for the network it is on. On another one there is no vault at this
        // address and the answer is empty, which is not a list that failed to load.
        const here = (await eth.request({ method: "eth_chainId" }).catch(() => null)) as string | null
        if (here === null || Number(here) !== body.chainId) {
          setNote({
            text: `The wallet in this browser is on another network, so what was taken could not be read. Switch it to network ${body.chainId} and look again.`,
            bad: true,
          })
        } else {
          const answer = await call(
            eth,
            body.vault,
            encodeFunctionData({ abi: VAULT_ABI, functionName: "claimed", args: [address as `0x${string}`] })
          ).catch(() => null)
          try {
            if (answer) taken = decodeFunctionResult({ abi: VAULT_ABI, functionName: "claimed", data: answer })
          } catch {
            taken = null
          }
        }
      }
      setMine({ index, earned: BigInt(body.list[index][1]), taken })
    } catch {
      setNote({ text: "The list could not be loaded. Try again.", bad: true })
    } finally {
      setBusy(false)
    }
  }

  async function claim() {
    const eth = provider()
    if (!eth || !vault || !mine || vault.hour === null || !vault.root || !vault.signature) {
      setNote({ text: "A claim is a transaction, so it needs a wallet in this browser.", bad: true })
      return
    }
    setSending(true)
    setNote(null)
    try {
      await onNetwork(eth, vault.chainId)
      const from = (await connect(eth)) ?? wallet
      const lines = vault.list.map(([listed, amount]) => ({ wallet: listed as `0x${string}`, amount: BigInt(amount) }))
      const data = encodeFunctionData({
        abi: VAULT_ABI,
        functionName: "claim",
        args: [wallet as `0x${string}`, mine.earned, BigInt(vault.hour), vault.root, vault.signature, proofOf(lines, mine.index)],
      })
      const hash = await send(eth, from, vault.vault, data)
      const done = await mined(eth, hash)
      if (done) setMine({ ...mine, taken: mine.earned })
      setNote(
        done
          ? { text: `Claimed. The ${vault.reward.symbol} is in the wallet.`, bad: false }
          : { text: "The transaction did not go through. Nothing was claimed.", bad: true }
      )
    } catch {
      setNote({ text: "Nothing was sent, so nothing was claimed.", bad: true })
    } finally {
      setSending(false)
    }
  }

  const symbol = vault?.reward?.symbol ?? "NVDA"
  const decimals = vault?.reward?.decimals ?? 18
  const show = (units: bigint) => `${formatUnitsShort(units, decimals, 9)} ${symbol}`
  const waiting = mine && mine.taken !== null ? mine.earned - mine.taken : null
  const closed = vault?.closed ?? null
  const owners = closed !== null && closed.to === wallet.toLowerCase()

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
          {busy ? "Looking" : "See what it has earned"}
        </Button>
      </fieldset>

      <p aria-live="polite" className={cn("mt-4 min-h-6 text-sm leading-snug", note?.bad ? "text-destructive" : "text-foreground")}>
        {note?.text}
      </p>

      {mine === null ? (
        <p className="mt-2 rounded-lg bg-secondary px-5 py-4 leading-relaxed text-muted-foreground">
          {closed
            ? "This wallet has nothing on the list. The reward is closed, and what had not been claimed by then went back to the owner."
            : "This wallet has earned nothing so far. A wallet earns an hour when it held the minimum from the first block of that hour to the last, and the list is made after each hour ends."}
        </p>
      ) : mine && vault ? (
        <div className="mt-2 rounded-lg bg-secondary px-5 py-4">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="label-mono text-muted-foreground">{owners ? "On the owner's line" : closed ? "On its line" : "Earned so far"}</dt>
              <dd className="mt-1 font-mono text-sm font-medium break-all">{show(mine.earned)}</dd>
            </div>
            <div>
              <dt className="label-mono text-muted-foreground">Taken</dt>
              <dd className="mt-1 font-mono text-sm font-medium break-all">{mine.taken === null ? "Unknown" : show(mine.taken)}</dd>
            </div>
            <div>
              <dt className="label-mono text-muted-foreground">To claim</dt>
              <dd className="mt-1 font-mono text-sm font-medium break-all">{waiting === null ? "Unknown" : show(waiting)}</dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {waiting === null ? (
              <span className="label-mono text-muted-foreground">Open this page with the wallet to claim</span>
            ) : !vault.signature ? (
              <span className="label-mono text-muted-foreground">The list is not signed yet, so it cannot be claimed</span>
            ) : waiting === 0n ? (
              <span className="label-mono rounded-md bg-foreground/10 px-2.5 py-1.5">All claimed</span>
            ) : (
              <Button type="button" disabled={sending} onClick={claim}>
                {sending ? "Waiting for the wallet" : "Claim"}
              </Button>
            )}
            {vault.hour !== null ? <span className="label-mono text-muted-foreground">Counted up to {hourLabel(vault.hour + 1)}</span> : null}
          </div>
          <p className="mt-4 text-sm leading-snug text-muted-foreground">
            A claim costs the network&apos;s fee, whatever its size. What is earned waits while the reward runs, so
            claiming now and then costs less than claiming every hour. If the owner closes the reward, what was
            not claimed goes back to the owner.
          </p>
        </div>
      ) : null}
    </div>
  )
}
