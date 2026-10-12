"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { PROBLEM_MAX, PROBLEM_MIN } from "@/lib/order-times"
import type { OrderView } from "@/lib/orders"
import { cn } from "@/lib/utils"

// Where a buyer says that the item they were handed does not work, and reads the answer: the
// owner's, or the seller's when the item was another seller's (the payment went to that seller,
// so a refund is theirs to send; the shop's owner reads the report too). It needs no email and no
// account: the order's link is how the report is found. Closed until it is asked for, so an order
// that went well shows one quiet line.
export function ProblemForm({
  id,
  network,
  problem,
  seller = null,
}: {
  id: string
  network: "testnet" | "mainnet"
  problem: OrderView["problem"]
  seller?: string | null
}) {
  const who = seller ? "seller" : "owner"
  const [kept, setKept] = useState(problem)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [address, setAddress] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/orders/${id}/problem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, address }),
    }).catch(() => null)
    const body = (await response?.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    setBusy(false)
    if (!response?.ok || !body?.ok) {
      setError(body?.error ?? "The report could not be sent. Check your connection and try again.")
      return
    }
    setKept({ note: note.trim(), at: Date.now(), answered: false, reply: null, refunded: false })
    setOpen(false)
    setNote("")
    setAddress("")
  }

  if (kept?.answered) {
    return (
      <div className="mt-8 rounded-xl bg-secondary p-5 text-sm leading-relaxed">
        <p className="label-mono mb-2 text-muted-foreground">Your report was answered</p>
        <p>
          {kept.refunded
            ? seller
              ? "The seller said a refund was sent to the address you gave, less the network's fee."
              : "A refund was sent by hand to the address you gave, less the network's fee."
            : "The report was read, and no refund was sent."}
        </p>
        {kept.reply ? (
          <p className="mt-3 text-muted-foreground">
            <span className="text-foreground">The {who} wrote:</span> {kept.reply}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-8">
      {kept ? (
        <div className="rounded-xl bg-secondary p-5 text-sm leading-relaxed">
          <p className="label-mono mb-2 text-muted-foreground">You reported a problem</p>
          <p className="break-words whitespace-pre-wrap">{kept.note}</p>
          <p className="mt-3 text-muted-foreground">
            {seller
              ? "It went to the seller, who answers on this page, and the shop's owner reads it too. Keep the link and come back with it."
              : "The owner reads each report by hand and answers on this page. Keep the link and come back with it."}
          </p>
        </div>
      ) : null}

      {open ? (
        <form onSubmit={send} className={cn("rounded-xl bg-secondary p-5", kept && "mt-2.5")}>
          <label className="block">
            <span className="label-mono text-muted-foreground">What is wrong</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              maxLength={PROBLEM_MAX}
              placeholder="What you tried, on which phone or service, and what it said."
              className="mt-2 w-full rounded-lg bg-background px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </label>
          <label className="mt-4 block">
            <span className="label-mono text-muted-foreground">Where a refund would go</span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value.trim())}
              placeholder={network === "testnet" ? "utest1… or ztestsapling1…" : "u1… or zs1…"}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              className="mt-2 w-full rounded-lg bg-background px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          </label>
          <p className="mt-3 text-sm leading-snug text-muted-foreground">
            A shielded address from your own wallet, copied whole. Both are kept with this order and read by
            {seller ? " the seller and the shop's owner" : " the owner"}: write nothing here that you want kept from
            {seller ? " either" : " the shop"}. A report does not by itself mean a refund
            {seller ? ", and the shop cannot send one for a seller: it never held the payment." : "."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" disabled={busy || note.trim().length < PROBLEM_MIN || address.length < 20}>
              {busy ? "Sending" : kept ? "Replace the report" : "Send the report"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <p aria-live="polite" className="text-sm leading-snug text-destructive">
              {error}
            </p>
          </div>
        </form>
      ) : (
        <p className={cn("text-sm leading-relaxed text-muted-foreground", kept && "mt-3")}>
          {kept ? "Something to add? " : "Does the item not work? "}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            {kept ? "Write the report again" : `Report it to the ${who}`}
          </button>
          . No email and no account are asked for.
        </p>
      )}
    </div>
  )
}
