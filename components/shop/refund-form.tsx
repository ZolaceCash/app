"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Where the buyer says which address a refund should go to. It is the one thing an order ever
// asks of a buyer, and only when something is owed back: a shielded payment names no sender, so
// the shop cannot know where to send it.
export function RefundForm({ id, network, onFile }: { id: string; network: "testnet" | "mainnet"; onFile: string | null }) {
  const [address, setAddress] = useState("")
  const [kept, setKept] = useState(onFile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/orders/${id}/refund-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    }).catch(() => null)
    const body = (await response?.json().catch(() => null)) as { refundTo?: string; error?: string } | null
    setBusy(false)
    if (!response?.ok || !body?.refundTo) {
      setError(body?.error ?? "The address could not be saved. Check your connection and try again.")
      return
    }
    setKept(body.refundTo)
    setAddress("")
  }

  return (
    <form onSubmit={save} className="mt-6">
      {kept ? (
        <p className="rounded-lg bg-secondary px-4 py-3 text-sm leading-snug">
          <span className="label-mono mb-1.5 block text-muted-foreground">Address on file</span>
          <span className="font-mono">{kept}</span>
          <span className="mt-1.5 block text-muted-foreground">
            The refund goes there. You can give another one until it is sent.
          </span>
        </p>
      ) : null}
      <label className="mt-4 block">
        <span className="label-mono text-muted-foreground">
          {kept ? "Another address" : "Where to send it"}
        </span>
        <input
          value={address}
          onChange={(event) => setAddress(event.target.value.trim())}
          placeholder={network === "testnet" ? "utest1… or ztestsapling1…" : "u1… or zs1…"}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className="mt-2 w-full rounded-lg bg-secondary px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </label>
      <p className="mt-2 text-sm leading-snug text-muted-foreground">
        A shielded address from your own wallet, copied whole. It is checked for typing errors, kept with this
        order, and used for nothing else.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" disabled={busy || address.length < 20}>
          {busy ? "Saving" : kept ? "Replace the address" : "Save the address"}
        </Button>
        <p aria-live="polite" className={cn("text-sm leading-snug", error ? "text-destructive" : "text-muted-foreground")}>
          {error}
        </p>
      </div>
    </form>
  )
}
