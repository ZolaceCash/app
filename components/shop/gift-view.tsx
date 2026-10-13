"use client"

import { Gift, TriangleAlert } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"

import { ItemView } from "@/components/shop/item-view"
import { DotLabel, PillLink } from "@/components/site/primitives"
import { giftState } from "@/lib/gift"
import type { OrderView as Order } from "@/lib/orders"
import { openSealed } from "@/lib/seal"

const POLL_MS = 5000

// The part of the link after #. It exists only in the browser, so the server render has none.
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}
const readHash = () => window.location.hash.slice(1)

// A gift's page: the item of an order, for whoever was sent its link. It is the order's page with
// the buying left out: no price, no payment, no forms. The item is opened here, in this browser,
// with the secret from the link, exactly as on the order's page.
export function GiftView({ id }: { id: string }) {
  const secret = useSyncExternalStore(subscribeHash, readHash, () => "")
  const [loaded, setLoaded] = useState<{ order: Order } | { missing: true } | null>(null)
  const [item, setItem] = useState<{ text: string } | { failed: true } | null>(null)

  const order = loaded && "order" in loaded ? loaded.order : null
  const state = order ? giftState(order.state) : null
  // A gift that is not ready is asked about again; one that is open or was never completed is not.
  const waiting = !loaded || state === "not-yet"

  useEffect(() => {
    if (!waiting) return
    let alive = true
    const load = async () => {
      const response = await fetch(`/api/orders/${id}`, { cache: "no-store" }).catch(() => null)
      if (!alive || !response) return
      if (response.status === 404) return setLoaded({ missing: true })
      if (!response.ok) return
      setLoaded({ order: (await response.json()) as Order })
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [id, waiting])

  const sealed = order?.sealed
  const wrappedKey = order?.wrappedKey
  useEffect(() => {
    if (!sealed || !wrappedKey) return
    let alive = true
    openSealed(secret, wrappedKey, sealed).then(
      (text) => alive && setItem({ text }),
      () => alive && setItem({ failed: true })
    )
    return () => {
      alive = false
    }
  }, [secret, sealed, wrappedKey])

  if (loaded && "missing" in loaded) {
    return (
      <Message title="There is no gift behind this link.">
        It may have been deleted: finished orders are removed after 7 days. Check that the link is complete.
      </Message>
    )
  }
  if (!order) return <div aria-busy className="h-[28rem] cut rounded-3xl bg-card" />

  return (
    <div className="enter">
      <div className="px-3 pb-10 md:px-4">
        <DotLabel>A gift for you</DotLabel>
        <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-6xl">{order.product}</h1>
        {order.test ? (
          <p className="label-mono mt-5 inline-flex items-center gap-2.5 rounded-md bg-secondary py-2 pr-3.5 pl-3">
            <span aria-hidden className="size-1.5 rounded-full bg-signal" />
            Test order: the item is made up
          </p>
        ) : null}
      </div>

      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="cut-2 rounded-3xl bg-card p-7 md:p-10">
          {state === "open" ? (
            <>
              <p className="label-mono flex items-center gap-2 text-muted-foreground">
                <Gift aria-hidden className="size-3.5" />
                Yours to open
              </p>
              {item && "text" in item ? (
                <>
                  <ItemView text={item.text} product={order.product} goneAfter={order.goneAfter} />
                  <p className="mt-6 leading-relaxed text-muted-foreground">
                    Opened in this browser, with the secret from the link. The server keeps a sealed copy it
                    cannot read.
                  </p>
                </>
              ) : item ? (
                <div role="alert" className="mt-4 rounded-xl bg-destructive/10 p-5">
                  <p className="flex items-center gap-2 font-medium">
                    <TriangleAlert aria-hidden className="size-4 text-destructive" />
                    This link cannot open the gift.
                  </p>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    The part after # is missing or is not the one this gift was made with. Ask whoever sent it
                    for the whole link.
                  </p>
                </div>
              ) : (
                <p className="mt-4 h-20 rounded-xl bg-secondary" aria-busy />
              )}
            </>
          ) : state === "not-yet" ? (
            <>
              <p className="label-mono text-muted-foreground">Not ready yet</p>
              <p className="mt-4 text-2xl font-medium tracking-[-0.035em]">This gift opens here when it is ready.</p>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                Whoever sent it is still completing the order. Keep the link and come back: this page looks again
                by itself while it is open.
              </p>
            </>
          ) : (
            <>
              <p className="label-mono text-muted-foreground">Not completed</p>
              <p className="mt-4 text-2xl font-medium tracking-[-0.035em]">There is nothing to open behind this link.</p>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                The order it belongs to was not completed, so no item was handed over. Ask whoever sent it.
              </p>
            </>
          )}
        </div>

        <div className="cut rounded-3xl bg-card p-6 md:p-8">
          <p className="label-mono text-brand">About this link</p>
          <ul className="mt-6 space-y-4 leading-snug">
            {[
              "This link is the gift. Whoever has all of it, including the part after #, can open it. Keep it somewhere safe.",
              "Nothing here asks who you are. There is no account to make and nothing to pay.",
              "The shop cannot give the link back: it never has the part after #.",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 bg-current opacity-50" />
                {line}
              </li>
            ))}
          </ul>
          <PillLink href="/shop" variant="secondary" arrow className="mt-8">
            See the shop
          </PillLink>
        </div>
      </div>
    </div>
  )
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cut rounded-3xl bg-card p-7 md:p-12">
      <h1 className="text-3xl font-medium tracking-[-0.04em] md:text-4xl">{title}</h1>
      <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">{children}</p>
      <PillLink href="/shop" arrow className="mt-8">
        Go to the shop
      </PillLink>
    </div>
  )
}
