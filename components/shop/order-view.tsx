"use client"

import { Check, Gift, Link2, TriangleAlert } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"

import { ZecIcon } from "@/components/site/chain-icons"
import { ProblemForm } from "@/components/shop/problem-form"
import { Qr } from "@/components/shop/qr"
import { RefundForm } from "@/components/shop/refund-form"
import { CopyButton } from "@/components/site/copy-button"
import { DotLabel, PillLink } from "@/components/site/primitives"
import { Button } from "@/components/ui/button"
import { LATE_MS } from "@/lib/order-times"
import type { OrderView as Order } from "@/lib/orders"
import { formatZec } from "@/lib/price"
import { openSealed } from "@/lib/seal"
import { cn } from "@/lib/utils"

const POLL_MS = 2000
const HAND_POLL_MS = 30_000
const STEPS = ["Waiting", "Seen", "Confirmed", "Delivered"] as const

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

// The part of the link after #. It exists only in the browser, so the server render has none.
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}
const readHash = () => window.location.hash.slice(1)

type Loaded = { order: Order; skew: number } | { missing: true } | null

// An eSIM's activation code is one line, LPA:1$<where the profile is fetched>$<its code>. A phone
// that is given it by hand often asks for the two parts apart. Null when the line is not of that
// shape, and the whole line is then all there is to show.
function esimParts(text: string) {
  const [head, address, code] = text.trim().split("$")
  return head === "LPA:1" && address && code ? { address, code } : null
}

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
  const esim = item && "text" in item ? esimParts(item.text) : null
  // Nothing more is expected for these, so the page stops asking by itself. A real order that
  // expired is asked about for a while longer: a payment may come late, and is then owed back.
  // (Opening the page again always asks once more.)
  const finished =
    order?.state === "delivered" ||
    order?.state === "refunded" ||
    order?.state === "owed" ||
    (order?.state === "expired" && (order.network === "stand-in" || order.now > order.expiresAt + LATE_MS))

  const awaited = order?.handBy != null

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
    // An item that is bought by hand takes hours, not seconds: ask rarely while it is awaited.
    const timer = window.setInterval(load, awaited ? HAND_POLL_MS : POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [id, finished, awaited])

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
  // How far along the four steps the order is. An order that is owed a refund stops at the step
  // its payment reached: nowhere if too little came, "Seen" if it came too late, "Confirmed" if
  // it was paid in full and there was nothing to hand over.
  const stopped = order.owedWhy === "no-item" ? 2 : order.owedWhy === "late" ? 1 : 0
  const at = { waiting: 0, underpaid: 0, seen: 1, confirmed: 2, delivered: 4, expired: -1, owed: stopped, refunded: stopped }[
    order.state
  ]
  const title = {
    waiting: "Waiting for your payment",
    underpaid: "Part of the amount arrived",
    seen: "Payment seen",
    confirmed: order.handBy ? "Your item is being bought" : order.making ? "Preparing your item" : "Confirming your payment",
    delivered: "Your item",
    expired: "This order expired",
    owed: "A refund is owed to you",
    refunded: "This order was refunded",
  }[order.state]
  const missing = Math.max(0, order.zat - order.receivedZat)
  // How long the owner still has to hand over an item bought by hand, in words.
  // (Less a minute, so that twelve hours and a second read as twelve, not thirteen.)
  const handHoursLeft = order.handBy ? Math.ceil((order.handBy - (now + loaded.skew) - 60_000) / (60 * 60 * 1000)) : 0
  const handWithin = handHoursLeft > 1 ? `within ${handHoursLeft} hours` : "within the hour"

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
        {order.network !== "mainnet" ? (
          <p className="label-mono mt-6 inline-flex items-center gap-2.5 rounded-md bg-secondary py-2 pr-3.5 pl-3">
            <span aria-hidden className="live-dot size-1.5 rounded-full bg-signal" />
            {order.network === "testnet"
              ? "Zcash test network: these coins are worth nothing"
              : "Test order: no money moves and the item is made up"}
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
                      : current && index === 0 && (order.state === "waiting" || order.state === "underpaid")
                        ? `Held for ${clock}`
                        : ""}
                </span>
              </li>
            )
          })}
        </ol>

        {/* What to do now, or the item. */}
        <div className="cut rounded-3xl bg-card p-6 md:p-8">
          {order.state === "waiting" || order.state === "underpaid" ? (
            <>
              <p className="label-mono text-muted-foreground">
                {order.state === "underpaid" ? "Send the rest" : "Send exactly"}
              </p>
              <p className="mt-4 flex items-center gap-3 font-mono text-4xl font-medium tracking-[-0.04em] md:text-5xl">
                <ZecIcon className="size-9 shrink-0 text-brand" />
                {formatZec(order.state === "underpaid" ? missing : order.zat)}
              </p>
              {order.state === "underpaid" ? (
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  {formatZec(order.receivedZat)} ZEC arrived of {formatZec(order.zat)}. Send the rest to the same
                  address before the price lock runs out. If it does not arrive in time, what you sent is owed
                  back to you.
                </p>
              ) : null}
              <dl className="mt-8 space-y-1.5">
                <Row name="Item">{order.product}</Row>
                <Row name="Price">{dollars(order.priceCents)}</Row>
                <Row name="Price held for">
                  <span className="text-brand tabular-nums">{clock}</span>
                </Row>
                <Row name="Network">{order.network === "testnet" ? "Zcash test network, shielded" : "Zcash, shielded"}</Row>
                <Row name="To">
                  <span className="break-all">{order.address}</span>
                </Row>
              </dl>
              {order.test ? null : (
                <div className="mt-6 flex flex-wrap items-center gap-5">
                  <Qr
                    text={`zcash:${order.address}?amount=${formatZec(order.state === "underpaid" ? missing : order.zat)}`}
                    label="The address and the amount, as a QR code for a Zcash wallet"
                  />
                  <p className="max-w-[16rem] text-sm leading-snug text-muted-foreground">
                    Scan it with your Zcash wallet: it fills in the address and the amount. The code is drawn in
                    your browser. Is your wallet on this device? Open it from the button below instead.
                  </p>
                </div>
              )}
              {order.test ? null : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <CopyButton text={order.address} variant="secondary">
                    Copy the address
                  </CopyButton>
                  <CopyButton text={formatZec(order.state === "underpaid" ? missing : order.zat)} variant="secondary">
                    Copy the amount
                  </CopyButton>
                  {/* The same request as the QR code, handed to a wallet on this device. It goes to no
                      server: a zcash: address is opened by whatever wallet took that name. */}
                  <Button asChild variant="secondary">
                    <a href={`zcash:${order.address}?amount=${formatZec(order.state === "underpaid" ? missing : order.zat)}`}>
                      Open in your wallet
                    </a>
                  </Button>
                </div>
              )}
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

          {order.state === "seen" || order.state === "confirmed" ? (
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
                {order.handBy
                  ? `Your payment is confirmed. The item is now bought for this order, by hand, and opens on this page ${handWithin}. If it is not handed over by then, all of your payment is owed back to you. Keep the link and come back with it: there is nothing to wait for here.`
                  : order.making
                  ? "Your payment is confirmed. The item is being made for this order and opens on this page when it is ready, usually within a minute. You can leave and come back with the link."
                  : "The item opens on this page when the last block arrives. You can leave and come back with the link."}
              </p>
            </>
          ) : null}

          {order.state === "delivered" ? (
            <>
              <p className="label-mono text-muted-foreground">{order.product}</p>
              {item && "text" in item ? (
                <>
                  {item.text.startsWith("LPA:") ? (
                    <div className="mt-4 flex flex-wrap items-center gap-5">
                      <Qr text={item.text} label="The eSIM's activation code, as a QR code" />
                      <p className="max-w-[18rem] text-sm leading-snug text-muted-foreground">
                        An eSIM. On the phone that will use it, open the mobile data settings, choose to add an
                        eSIM and scan this code. Reading this on that phone? It cannot scan its own screen:
                        enter the details by hand, from the parts below. Install it once: it works on one
                        phone.
                      </p>
                    </div>
                  ) : null}
                  {esim ? (
                    <dl className="mt-4 space-y-1.5">
                      {(
                        [
                          ["SM-DP+ address", esim.address],
                          ["Activation code", esim.code],
                        ] as const
                      ).map(([name, value]) => (
                        <div key={name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-secondary px-5 py-4">
                          <div className="min-w-0">
                            <dt className="label-mono text-muted-foreground">{name}</dt>
                            <dd className="mt-1.5 font-mono text-sm break-all">{value}</dd>
                          </div>
                          <CopyButton text={value} variant="outline" size="xs">
                            Copy
                          </CopyButton>
                        </div>
                      ))}
                      <p className="pt-1.5 text-sm leading-snug text-muted-foreground">
                        A phone that asks for the two apart takes these. One that asks for a single code takes
                        the whole line below, starting with LPA.
                      </p>
                    </dl>
                  ) : null}
                  <p
                    className={cn(
                      "mt-4 rounded-xl bg-secondary px-5 py-6 text-center font-mono break-all",
                      item.text.length > 40 ? "text-sm" : "text-xl tracking-[0.08em] md:text-2xl"
                    )}
                  >
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
                  {order.owedZat > 0 ? (
                    <Warning title={order.refunded ? "The excess was sent back." : "You paid more than the price."}>
                      {formatZec(order.receivedZat)} ZEC arrived for a price of {formatZec(order.zat)}.{" "}
                      {order.refunded
                        ? `${formatZec(order.owedZat)} ZEC was sent back by hand, less the network's fee.`
                        : `${formatZec(order.owedZat)} ZEC is owed back to you. Refunds are made by hand, less the network's fee, to the address you give below. Keep this link: it is how the order is found.`}
                    </Warning>
                  ) : null}
                  {order.owedZat > 0 && !order.refunded && order.network !== "stand-in" ? (
                    <RefundForm id={order.id} network={order.network} onFile={order.refundTo} />
                  ) : null}
                </>
              ) : item ? (
                <Warning title="This link cannot open the item.">
                  The part after # is missing or is not the one this order was made with. The
                  item was sealed to that secret, and the server does not have it.
                </Warning>
              ) : (
                <p className="mt-4 h-20 rounded-xl bg-secondary" aria-busy />
              )}
              {/* A made-up item paid with nothing has nothing to report. */}
              {!order.test && order.network !== "stand-in" ? (
                <ProblemForm id={order.id} network={order.network} problem={order.problem} />
              ) : null}
            </>
          ) : null}

          {order.state === "owed" ? (
            <Warning title={`${formatZec(order.owedZat)} ZEC is owed back to you.`}>
              {order.owedWhy === "short"
                ? `Only ${formatZec(order.receivedZat)} ZEC of ${formatZec(order.zat)} arrived before the price lock ran out, so nothing was handed over.`
                : order.owedWhy === "late"
                  ? "Your payment arrived after the price lock ran out. The item had gone back on the shelf, so nothing was handed over."
                  : "Your payment was confirmed, but no item was handed over for it: none was left, or it could not be bought in time."}{" "}
              Refunds are made by hand, less the network&apos;s fee, to the address you give below. Keep this
              link: it is how the order is found.
            </Warning>
          ) : null}
          {order.state === "owed" && order.network !== "stand-in" ? (
            <RefundForm id={order.id} network={order.network} onFile={order.refundTo} />
          ) : null}

          {order.state === "refunded" ? (
            <p className="leading-relaxed text-muted-foreground">
              Nothing was handed over, and the payment was sent back by hand to the address that was
              given for it, less the network&apos;s fee. Nothing more happens with this order.
            </p>
          ) : null}

          {order.state === "expired" ? (
            <>
              <p className="leading-relaxed text-muted-foreground">
                The price was held for 15 minutes and no payment was seen in that time. The item
                went back on the shelf.{" "}
                {order.network === "stand-in"
                  ? "Nothing was charged."
                  : "If you did send a payment, it is not lost: once it arrives it is shown on this page and is owed back to you."}
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
