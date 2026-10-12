"use client"

import { useState } from "react"

import { CopyButton } from "@/components/site/copy-button"
import { Button } from "@/components/ui/button"
import { THE_LINK } from "@/lib/sell"

// Where a seller signs up: a name buyers read, a viewing key, and a yes to the rules. The answer
// is the seller's link, shown once. Its secret is after the #, which a browser sends nowhere: the
// desk is opened with a plain page load, never a navigation that could carry it.

const FIELD =
  "mt-2 w-full rounded-lg bg-secondary px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"

export function JoinForm({ network }: { network: "testnet" | "mainnet" }) {
  const [name, setName] = useState("")
  const [viewingKey, setViewingKey] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const response = await fetch("/api/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, viewingKey, agreed }),
    }).catch(() => null)
    const body = (await response?.json().catch(() => null)) as { token?: string; error?: string } | null
    setBusy(false)
    if (!response?.ok || !body?.token) {
      setError(body?.error ?? "The sign-up could not be sent. Check your connection and try again.")
      return
    }
    // The key is not kept in the page once it has been sent.
    setViewingKey("")
    setLink(`${window.location.origin}/sell/desk#${body.token}`)
  }

  if (link) {
    return (
      <div>
        <p className="label-mono text-brand">You are signed up</p>
        <h2 className="mt-5 text-3xl leading-[1.03] font-medium tracking-[-0.04em] text-balance md:text-4xl">
          Save this link. It is shown once.
        </h2>
        <p className="mt-6 rounded-xl bg-ice px-5 py-4 font-mono text-sm break-all text-ink">{link}</p>
        <div className="mt-3">
          <CopyButton text={link} variant="secondary">
            Copy the link
          </CopyButton>
        </div>
        <ul className="mt-6 space-y-3 leading-snug text-muted-foreground">
          {THE_LINK.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <label className="mt-6 flex items-start gap-3 leading-snug">
          <input
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
            className="mt-1 size-4 accent-[var(--primary)]"
          />
          <span>I have saved the link somewhere I will find it again.</span>
        </label>
        <div className="mt-5">
          {saved ? (
            <Button asChild size="lg">
              <a href={link}>Open my desk</a>
            </Button>
          ) : (
            <Button size="lg" disabled>
              Open my desk
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={send}>
      <label className="block">
        <span className="label-mono text-muted-foreground">Your name as a seller</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          autoComplete="off"
          placeholder="Shown on your items"
          className={FIELD}
        />
      </label>
      <p className="mt-2 text-sm leading-snug text-muted-foreground">
        2 to 40 letters, digits and spaces. Buyers read it on every item of yours. It does not have to say who you are.
      </p>

      <label className="mt-5 block">
        <span className="label-mono text-muted-foreground">The viewing key of your selling wallet</span>
        <textarea
          value={viewingKey}
          onChange={(event) => setViewingKey(event.target.value)}
          rows={5}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder={network === "testnet" ? "uviewtest1…" : "uview1…"}
          className={`${FIELD} font-mono leading-relaxed break-all`}
        />
      </label>
      <p className="mt-2 text-sm leading-snug text-muted-foreground">
        The unified full viewing key, copied whole from a wallet you made for selling here. It lets the shop see
        payments arrive and cannot spend them. Never paste a seed phrase or a spending key: nothing here asks for one.
      </p>

      <label className="mt-6 flex items-start gap-3 leading-snug">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-1 size-4 accent-[var(--primary)]"
        />
        <span>
          I have read what may not be sold here, and that a refund of an order of mine is mine to send: the shop never
          holds the money.
        </span>
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" size="lg" disabled={busy || name.trim().length < 2 || viewingKey.trim().length < 100 || !agreed}>
          {busy ? "Signing up" : "Sign up as a seller"}
        </Button>
        <p aria-live="polite" className="max-w-md text-sm leading-snug text-destructive">
          {error}
        </p>
      </div>
    </form>
  )
}
