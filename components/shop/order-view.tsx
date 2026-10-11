"use client"

import { Check, Gift, Link2, TriangleAlert } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"

import { ZecIcon } from "@/components/site/chain-icons"
import { CopyButton } from "@/components/site/copy-button"
import { DotLabel, PillLink } from "@/components/site/primitives"
import { Button } from "@/components/ui/button"
import type { OrderView as Order } from "@/lib/orders"
import { formatZec } from "@/lib/price"
import { openSealed } from "@/lib/seal"
import { cn } from "@/lib/utils"

const POLL_MS = 2000
const STEPS = ["Waiting", "Seen", "Confirmed", "Delivered"] as const

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

// The part of the link after #. It exists only in the browser, so the server render has none.
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}
const readHash = () => window.location.hash.slice(1)

type Loaded = { order: Order; skew: number } | { missing: true } | null

// The order page: where a buyer pays, watches the order move and takes the item. It asks the
// server where the order stands every two seconds until the order is finished, and opens the
// sealed item here, with the secret from the link.
export function OrderView({ id }: { id: string }) {
  const secret = useSyncExternalStore(subscribeHash, readHash, () => "")
  const [loaded, setLoaded] = useState<Loaded>(null)
  const [now, setNow] = useState(0)
  const [paying, setPaying] = useState(false)
  const [item, setItem] = useState<{ text: string } | { failed: true } | null>(null)

  const order = loaded && "order" in loaded ? loaded.order : null
  const finished = order?.state === "delivered" || order?.state === "expired" || order?.state === "refunded"

  useEffect(() => {
    if (finished) return
    let alive = true
    const load = async () => {
      const response = await fetch(`/api/orders/${id}`, { cache: "no-store" }).catch(() => null)
      if (!alive || !response) return
      if (response.status === 404) return setLoaded({ missing: true })
      if (!response.ok) return
      const next = (await response.json()) as Order
      // The server's clock decides when the lock runs out; remember how far this one is off.
      setLoaded({ order: next, skew: next.now - Date.now() })
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [id, finished])

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

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

  async function pay() {
    setPaying(true)
    await fetch(`/api/orders/${id}/pay`, { method: "POST" }).catch(() => null)
  }

  if (loaded && "missing" in loaded) {
    return (
      <Message title="There is no order behind this link.">
        It may have been deleted: finished orders are removed after some days. Check that the
        link is complete.
      </Message>
    )
  }

  if (!order || !loaded || !("order" in loaded)) {
    return <div aria-busy className="h-[28rem] cut rounded-3xl bg-card" />
  }

  const left = Math.max(0, Math.round((order.expiresAt - (now + loaded.skew)) / 1000))
  const clock = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`
  // How far along the four steps the order is.
  // A paid order that was not delivered stops at "Confirmed": that step is as far as it got.
  const at = { waiting: 0, seen: 1, confirmed: 2, delivered: 4, expired: -1, refunded: 2 }[order.state]
  const title = {
    waiting: "Waiting for your payment",
    seen: order.confirmations > 0 ? "Confirming your payment" : "Payment seen",
    // An order rests here only when it was paid and there was nothing to hand over.
    confirmed: "Paid, but the item could not be handed over",
    delivered: "Your item",
    expired: "This order expired",
    refunded: "This order was refunded",
  }[order.state]

  return (
    <div className="enter">
      <div className="px-3 pb-10 md:px-4">
        <DotLabel>
          <span className="text-muted-foreground">Order /</span>
          {order.id.slice(0, 8)}
        </DotLabel>
        <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-6xl">
          {title}
        </h1>
        {order.test ? (
          <p className="label-mono mt-6 inline-flex items-center gap-2.5 rounded-md bg-secondary py-2 pr-3.5 pl-3">
            <span aria-hidden className="live-dot size-1.5 rounded-full bg-signal" />
            Test order: no money moves and the item is made up
          </p>
        ) : null}
      </div>

      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Where the order stands. */}
        <ol className="space-y-1.5 cut rounded-3xl bg-card p-4 md:p-6">
          {STEPS.map((step, index) => {
            const done = at > index
            const current = at === index
            return (
              <li
                key={step}
                className={cn(
                  "flex items-center justify-between rounded-lg py-3 pr-4 pl-3 transition-colors duration-500",
                  current ? "bg-accent" : "bg-secondary"
                )}
              >
                <span
                  className={cn(
                    "flex items-center gap-3 font-medium transition-colors duration-500",
                    !done && !current && "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-md font-mono text-[0.625rem] transition-colors duration-500",
                      current
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-foreground text-background"
                          : "bg-foreground/10 text-muted-foreground"
                    )}
                  >
                    {done ? <Check aria-hidden className="size-3.5" /> : index + 1}
                  </span>
                  {step}
                </span>
                <span className={cn("label-mono", current ? "text-brand" : "text-muted-foreground")}>
                  {index === 2 && at >= 1 && at < 4
                    ? `${order.confirmations} of ${order.confirmationsNeeded} blocks`
                    : done
                      ? "Done"
                      : current && index === 0
                        ? `Held for ${clock}`
                        : ""}
                </span>
              </li>
            )
          })}
        </ol>

        {/* What to do now, or the item. */}
        <div className="cut rounded-3xl bg-card p-6 md:p-8">
          {order.state === "waiting" ? (
            <>
              <p className="label-mono text-muted-foreground">Send exactly</p>
              <p className="mt-4 flex items-center gap-3 font-mono text-4xl font-medium tracking-[-0.04em] md:text-5xl">
                <ZecIcon className="size-9 shrink-0 text-brand" />
                {formatZec(order.zat)}
              </p>
              <dl className="mt-8 space-y-1.5">
                <Row name="Item">{order.product}</Row>
                <Row name="Price">{dollars(order.priceCents)}</Row>
                <Row name="Price held for">
                  <span className="text-brand tabular-nums">{clock}</span>
                </Row>
                <Row name="Network">Zcash, shielded</Row>
                <Row name="To">
                  <span className="break-all">{order.address}</span>
                </Row>
              </dl>
              {order.test ? (
                <div className="mt-6 rounded-xl bg-accent p-5">
                  <p className="leading-relaxed text-foreground/85">
                    The address above is not a real one. In the real shop you would pay it from
                    your own wallet; here one press stands in for that payment.
                  </p>
                  <Button onClick={pay} disabled={paying} size="lg" className="mt-4">
                    {paying ? "Payment sent" : "Simulate the payment"}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}

          {order.state === "seen" ? (
            <>
              <p className="label-mono text-muted-foreground">Confirmations</p>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-mono text-[5rem] leading-[0.85] font-medium tracking-[-0.06em]">
                  {order.confirmations}
                </span>
                <span className="font-mono text-xl text-muted-foreground">
                  of {order.confirmationsNeeded} blocks
                </span>
              </p>
              <div aria-hidden className="mt-8 flex gap-1">
                {Array.from({ length: order.confirmationsNeeded }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-2 flex-1 rounded-full transition-colors duration-500",
                      index < order.confirmations ? "bg-primary" : "bg-foreground/10"
                    )}
                  />
                ))}
              </div>
              <p className="mt-6 leading-relaxed text-muted-foreground">
                The item opens on this page when the last block arrives. You can leave and come
                back with the link.
              </p>
            </>
          ) : null}

          {order.state === "delivered" ? (
            <>
              <p className="label-mono text-muted-foreground">{order.product}</p>
              {item && "text" in item ? (
                <>
                  <p className="mt-4 rounded-xl bg-secondary px-5 py-6 text-center font-mono text-xl tracking-[0.08em] break-all md:text-2xl">
                    {item.text}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <CopyButton text={item.text} size="lg">
                      Copy the item
                    </CopyButton>
                    <PillLink href="/shop" variant="secondary" size="lg">
                      Back to the shop
                    </PillLink>
                  </div>
                  <p className="mt-6 leading-relaxed text-muted-foreground">
                    Opened in this browser, with the secret from the link. The server keeps a
                    sealed copy it cannot read.
                  </p>
                </>
              ) : item ? (
                <Warning title="This link cannot open the item.">
                  The part after # is missing or is not the one this order was made with. The
                  item was sealed to that secret, and the server does not have it.
                </Warning>
              ) : (
                <p className="mt-4 h-20 rounded-xl bg-secondary" aria-busy />
              )}
            </>
          ) : null}

          {order.state === "confirmed" ? (
            <Warning title="A refund is owed to you.">
              Your payment was confirmed, but there was no item left to hand over. Refunds are
              made by hand, to an address you give. Keep this link: it is how the order is found.
            </Warning>
          ) : null}

          {order.state === "refunded" ? (
            <p className="leading-relaxed text-muted-foreground">
              The item could not be handed over, and the payment was sent back by hand to the
              address that was given for it. Nothing more happens with this order.
            </p>
          ) : null}

          {order.state === "expired" ? (
            <>
              <p className="leading-relaxed text-muted-foreground">
                The price was held for 15 minutes and no payment was seen in that time. The item
                went back on the shelf. Nothing was charged.
              </p>
              <PillLink href="/shop" size="lg" arrow className="mt-6">
                Start a new order
              </PillLink>
            </>
          ) : null}
        </div>
      </div>

      {order.state !== "expired" && order.state !== "refunded" ? (
        <KeepTheLink delivered={order.state === "delivered"} />
      ) : null}
    </div>
  )
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3.5 sm:grid-cols-[9rem_1fr]">
      <dt className="label-mono pt-0.5 text-muted-foreground">{name}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  )
}

function Warning({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="mt-4 rounded-xl bg-destructive/10 p-5">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert aria-hidden className="size-4 text-destructive" />
        {title}
      </p>
      <p className="mt-2 leading-relaxed text-muted-foreground">{children}</p>
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

// The link is the receipt, and also the gift: whoever has all of it can open the order.
function KeepTheLink({ delivered }: { delivered: boolean }) {
  const href = useSyncExternalStore(
    subscribeHash,
    () => window.location.href,
    () => ""
  )
  const [path, secret] = href.replace(/^https?:\/\/[^/]+/, "").split("#")

  return (
    <div className="mt-2.5 grid gap-2.5 lg:grid-cols-2">
      <div className="cut rounded-3xl bg-card p-6 md:p-8">
        <p className="label-mono flex items-center gap-2 text-muted-foreground">
          <Link2 aria-hidden className="size-3.5" />
          Keep this link
        </p>
        <p className="mt-4 leading-relaxed">
          This link is the receipt. There is no account to recover it from, so save it before
          you close the page.
        </p>
        <p className="mt-4 rounded-lg bg-secondary px-4 py-3 font-mono text-xs break-all">
          {path}
          {secret ? <span className="text-brand">#{secret}</span> : null}
        </p>
        <CopyButton text={href} variant="secondary" className="mt-4">
          Copy the link
        </CopyButton>
      </div>

      <div className="cut rounded-3xl bg-card p-6 md:p-8">
        <p className="label-mono flex items-center gap-2 text-muted-foreground">
          <Gift aria-hidden className="size-3.5" />
          Send it as a gift
        </p>
        <p className="mt-4 leading-relaxed">
          {delivered
            ? "Whoever opens this link gets the item. Send the whole link, including the part after #, and the item is theirs to open."
            : "Once the item is delivered, whoever opens this link gets it. Pay the order, then send the whole link, including the part after #."}
        </p>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          There is no way to take a link back after sending it: anyone who has it can open the
          item, and so can you.
        </p>
      </div>
    </div>
  )
}
