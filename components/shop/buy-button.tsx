"use client"

import { ArrowUpRight } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { newOrderKeys } from "@/lib/seal"

// Checkout. There is no form because nothing is asked: the browser makes the order's keys and
// its secret, sends the server only what it may hold, and goes to the order's link. The secret
// rides in the part after #, which is never sent anywhere.
export function BuyButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function order() {
    setBusy(true)
    setError(null)
    try {
      const keys = await newOrderKeys()
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: slug, publicKey: keys.publicKey, wrappedKey: keys.wrappedKey }),
      })
      const body = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !body.id) {
        setError(body.error ?? "The order could not be started.")
        setBusy(false)
        return
      }
      // A plain page load, not a client-side navigation: the browser itself drops the part after
      // # before it asks the server for the page, so no code of ours ever handles the secret in a
      // request.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/o/${body.id}#${keys.secret}`)
    } catch {
      setError("The order could not be started. Check your connection and try again.")
      setBusy(false)
    }
  }

  return (
    <div>
      <Button onClick={order} disabled={busy}>
        {busy ? "Starting the order" : "Try a test order"}
        <ArrowUpRight
          aria-hidden
          className="transition-transform duration-300 ease-out group-hover/button:translate-x-0.5 group-hover/button:-translate-y-0.5"
        />
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
