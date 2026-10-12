"use client"

import Link from "next/link"
import { useState } from "react"

import { forget, keep, useKept } from "@/components/shop/kept-store"
import { Button } from "@/components/ui/button"
import { isKept } from "@/lib/kept"

// On the order page: lets the buyer have this browser keep the order's link. Nothing is kept
// until the button is pressed, and what is kept never leaves the browser (lib/kept.ts).
export function KeepHere({ id, secret, item, priceCents }: { id: string; secret: string; item: string; priceCents: number }) {
  const list = useKept()
  const [refused, setRefused] = useState(false)
  const kept = isKept(list, id, secret)

  return (
    <div className="mt-6 rounded-xl bg-secondary p-5">
      <p className="label-mono text-muted-foreground">{kept ? "Kept on this device" : "Or keep it on this device"}</p>
      <p className="mt-3 text-sm leading-snug text-muted-foreground">
        {kept
          ? "This browser has the link. It is on this device only: the shop does not have it and cannot give it back. Anyone who uses this browser can open the order."
          : "This browser can keep the link for you. It stays on this device and is never sent to the shop. Anyone who uses this browser can then open the order, so do not do it on a device you share."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {kept ? (
          <Button variant="outline" onClick={() => forget(id)}>
            Forget it here
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={!secret}
            onClick={() => setRefused(!keep({ id, secret, item, priceCents, keptAt: Date.now() }))}
          >
            Keep on this device
          </Button>
        )}
        <Link href="/orders" className="label-mono text-muted-foreground underline-offset-4 hover:underline">
          What this device keeps
        </Link>
      </div>
      {refused && !kept ? (
        <p role="alert" className="mt-3 text-sm leading-snug text-destructive">
          This browser would not store it. A private window, or a setting, can refuse. Copy the link instead.
        </p>
      ) : null}
    </div>
  )
}
