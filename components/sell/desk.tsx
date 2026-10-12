"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type ReactNode } from "react"

import { ZecIcon } from "@/components/site/chain-icons"
import { CopyButton } from "@/components/site/copy-button"
import { DotLabel } from "@/components/site/primitives"
import { Button } from "@/components/ui/button"
import { SHELVES } from "@/lib/catalog"
import { formatZec } from "@/lib/price"
import { NOT_SOLD, TAKEN_DOWN } from "@/lib/sell"
import type { Desk, DeskItem, DeskOrder } from "@/lib/sellers"
import { cn } from "@/lib/utils"

// A seller's desk: their items and codes, what they owe buyers, and what buyers reported. There
// is no account. The secret of the seller's link is read from the part of the address after #,
// which the browser sends nowhere, and goes with each request in a header. It is kept in this
// page's memory only: not in a cookie and not in the browser's storage. No code that was put
// behind an item is ever shown here again.

const FIELD =
  "mt-2 w-full rounded-lg bg-secondary px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"
const PANEL = "cut rounded-3xl bg-card p-6 md:p-8"

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
const when = (ms: number | null) => (ms ? `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC` : "")

const STATE: Record<DeskOrder["state"], string> = {
  waiting: "Waiting for payment",
  underpaid: "Part of it arrived",
  seen: "Payment seen",
  confirmed: "In a block",
  delivered: "Handed over",
  expired: "Ran out of time",
  owed: "You owe a refund",
  refunded: "Refunded",
}

const WHY = {
  short: "Less than the price arrived before the price lock ran out. Nothing was handed over.",
  late: "The payment arrived after the price lock ran out. Nothing was handed over.",
  "no-item": "Paid in full and in time, and no code was left to hand over.",
  excess: "The item was handed over. More than the price was paid: only the excess is owed.",
} as const

type Said = { ok?: string; error?: string }
type Act = (body: Record<string, unknown>) => Promise<Said>

export function SellerDesk() {
  const [token, setToken] = useState<string | null>(null)
  const [desk, setDesk] = useState<Desk | null>(null)
  const [state, setState] = useState<"reading" | "no-link" | "not-yours" | "down" | "ready">("reading")

  const load = useCallback(async (secret: string) => {
    const response = await fetch("/api/sell/desk", { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" }).catch(() => null)
    if (!response) return setState("down")
    if (response.status === 401) return setState("not-yours")
    const body = (await response.json().catch(() => null)) as Desk | null
    if (!response.ok || !body) return setState("down")
    setDesk(body)
    setState("ready")
  }, [])

  useEffect(() => {
    const read = () => {
      const secret = window.location.hash.slice(1)
      if (!secret) return setState("no-link")
      setToken(secret)
      void load(secret)
    }
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [load])

  const act: Act = useCallback(
    async (body) => {
      if (!token) return { error: "This page has no link to act with." }
      const response = await fetch("/api/sell/desk", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null)
      const answer = (await response?.json().catch(() => null)) as { said?: string; error?: string; desk?: Desk } | null
      if (!response?.ok || !answer?.desk) return { error: answer?.error ?? "That did not go through. Check your connection and try again." }
      setDesk(answer.desk)
      return { ok: answer.said }
    },
    [token]
  )

  if (state !== "ready" || !desk) {
    return (
      <div className={PANEL}>
        <DotLabel>Your desk</DotLabel>
        <p className="mt-5 max-w-xl leading-relaxed text-muted-foreground">
          {state === "reading"
            ? "Opening your desk…"
            : state === "no-link"
              ? "This page opens with a seller's link: the one you were shown when you signed up, with its secret after the #. Without it there is nothing to show."
              : state === "not-yours"
                ? "That link does not open a desk. Check that it was copied whole, with everything after the #."
                : "The shop did not answer. Check your connection and load the page again."}
        </p>
        <div className="mt-6">
          <Button asChild variant="secondary">
            <Link href="/sell">How selling works</Link>
          </Button>
        </div>
      </div>
    )
  }

  const owing = desk.orders.filter((order) => order.owedZat > 0 && !order.refunded)
  const reports = desk.orders.filter((order) => order.problem && !order.problem.answered)
  const canList = !desk.closed

  return (
    <div className="space-y-2.5">
      <div className="enter cut-2 rounded-3xl bg-card p-6 md:p-10">
        <DotLabel>
          <span className="text-muted-foreground">Seller&apos;s desk /</span>
          {desk.network === "testnet" ? "Test network" : "Paid in shielded ZEC"}
        </DotLabel>
        <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-6xl">{desk.name}</h1>
        <p className="mt-6 max-w-2xl leading-relaxed text-pretty text-muted-foreground">
          {desk.closed
            ? "The shop has closed this seller. None of your items can be ordered and nothing can be listed. What you owe buyers and what they reported is still here to deal with."
            : desk.open
              ? "Orders of your items are paid straight to your wallet. The shop holds none of it, so what an order is owed back is yours to send."
              : "Selling is not open on this server right now, or it runs on another network than your key. Your items are kept and are not on the shelf."}
        </p>
        {desk.page ? <YourPage page={desk.page} live={desk.open && !desk.closed} /> : null}
        <ul className="mt-6 flex flex-wrap gap-1.5">
          <li className="label-mono rounded-md bg-secondary px-3 py-2">
            {desk.items.length} of {desk.limits.maxItems} items
          </li>
          <li className="label-mono rounded-md bg-secondary px-3 py-2">At most {dollars(desk.limits.maxPriceCents)} an item</li>
          {owing.length > 0 ? <li className="label-mono rounded-md bg-destructive/20 px-3 py-2 text-destructive">{owing.length} to refund</li> : null}
          {reports.length > 0 ? <li className="label-mono rounded-md bg-destructive/20 px-3 py-2 text-destructive">{reports.length} reported</li> : null}
        </ul>
      </div>

      {reports.map((order) => (
        <Report key={order.ref} order={order} act={act} />
      ))}
      {owing.map((order) => (
        <Owed key={order.ref} order={order} act={act} />
      ))}

      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-2.5">
          {desk.items.length === 0 ? (
            <section className={PANEL}>
              <p className="label-mono text-muted-foreground">No items yet</p>
              <p className="mt-4 max-w-xl leading-relaxed">Add your first item. It starts off the shelf, so you can put codes behind it first.</p>
            </section>
          ) : (
            desk.items.map((item) => <Item key={item.id} item={item} act={act} canList={canList} />)
          )}
          <Orders orders={desk.orders} />
        </div>

        <div className="space-y-2.5 lg:sticky lg:top-24">
          {canList && desk.items.length < desk.limits.maxItems ? <NewItem act={act} most={desk.limits.maxPriceCents} /> : null}
          <Notices where={desk.notice} act={act} />
          <section className="cut rounded-3xl bg-ice p-6 text-ink md:p-8">
            <p className="label-mono">Not sold here</p>
            <ul className="mt-6 space-y-3 leading-snug">
              {NOT_SOLD.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-6 leading-snug">{TAKEN_DOWN}</p>
          </section>
        </div>
      </div>
    </div>
  )
}

// The seller's own page: the one link of theirs that is made to be passed around. Their desk's
// link is the opposite, and the two are told apart here in so many words.
function YourPage({ page, live }: { page: string; live: boolean }) {
  // The desk is only ever drawn in the browser, after it has answered for the link's secret.
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const address = `${origin}/s/${page}`
  return (
    <div className="mt-6 max-w-2xl rounded-xl bg-secondary p-5">
      <p className="label-mono text-muted-foreground">Your page, to share</p>
      <p className="mt-2 font-mono text-sm break-all">
        <Link href={`/s/${page}`} className="text-brand underline-offset-4 hover:underline">
          {address}
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <CopyButton text={address} variant="outline" size="xs">
          Copy the page&apos;s link
        </CopyButton>
        <p className="text-sm leading-snug text-muted-foreground">
          {live
            ? "Everything of yours that is on the shelf, on one page. Share this one. Never the link of this desk."
            : "It shows your items once they can be ordered. Until then it is not found."}
        </p>
      </div>
    </div>
  )
}

// A form of the desk: its fields, one button and what the last attempt said.
function DeskForm({
  onSend,
  label,
  variant = "secondary",
  clear = false,
  className,
  children,
}: {
  onSend: (form: FormData) => Promise<Said>
  label: string
  variant?: "default" | "secondary" | "outline"
  // Empty the fields once it went through: for a form that adds something.
  clear?: boolean
  className?: string
  children?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said>({})

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    const answer = await onSend(new FormData(form))
    setBusy(false)
    setSaid(answer)
    if (answer.ok && clear) form.reset()
  }

  return (
    <form onSubmit={send} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" disabled={busy} variant={variant}>
          {busy ? "Working" : label}
        </Button>
        <p aria-live="polite" className={cn("text-sm leading-snug", said.error ? "text-destructive" : "text-muted-foreground")}>
          {said.error ?? said.ok}
        </p>
      </div>
    </form>
  )
}

const value = (form: FormData, name: string) => String(form.get(name) ?? "")

function ShelfSelect({ shelf }: { shelf: string | null }) {
  return (
    <label className="block">
      <span className="label-mono text-muted-foreground">Shelf</span>
      <select name="shelf" defaultValue={shelf ?? ""} className={cn(FIELD, "h-11 py-0 font-mono")}>
        <option value="">On none</option>
        {SHELVES.map((entry) => (
          <option key={entry.slug} value={entry.slug}>
            {entry.name}
          </option>
        ))}
      </select>
    </label>
  )
}

// Being told: the seller gives the address of a notification service, and the shop sends one line
// there when something waits for them. The address is not shown again once it is saved.
function Notices({ where, act }: { where: string | null; act: Act }) {
  const [tested, setTested] = useState<Said>({})
  return (
    <section className={PANEL}>
      <DotLabel>Be told</DotLabel>
      <p className="mt-5 leading-snug text-muted-foreground">
        {where
          ? `You are told through ${where}. The address is kept on the shop's server and is not shown here again.`
          : "There is no account to send mail to. Give an address of your own and the shop sends one line there when an order of yours is handed over, an item runs out of codes, a buyer reports an item, or a refund is yours to send."}
      </p>
      <DeskForm label={where ? "Replace the address" : "Save the address"} clear className="mt-5 space-y-4" onSend={(form) => act({ do: "set-notice", address: value(form, "address") })}>
        <label className="block">
          <span className="label-mono text-muted-foreground">{where ? "Another address" : "Where to tell you"}</span>
          <input
            name="address"
            required
            maxLength={300}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder="https://ntfy.sh/a-long-random-name"
            className={cn(FIELD, "font-mono")}
          />
          <span className="mt-2 block text-sm leading-snug text-muted-foreground">
            An ntfy topic with a name of 16 characters or more, a Telegram bot&apos;s sendMessage address with its chat_id,
            or a Discord webhook. Whoever knows the address can read the lines, and the service learns that you had
            something to do and when. A line names no order, no item, no amount and no buyer.
          </span>
        </label>
      </DeskForm>
      {where ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="button" variant="secondary" onClick={async () => setTested(await act({ do: "test-notice" }))}>
            Send a test line
          </Button>
          <Button type="button" variant="outline" onClick={async () => setTested(await act({ do: "set-notice", address: "" }))}>
            Stop telling me
          </Button>
          <p aria-live="polite" className={cn("text-sm leading-snug", tested.error ? "text-destructive" : "text-muted-foreground")}>
            {tested.error ?? tested.ok}
          </p>
        </div>
      ) : null}
    </section>
  )
}

function NewItem({ act, most }: { act: Act; most: number }) {
  return (
    <section className={PANEL}>
      <DotLabel>A new item</DotLabel>
      <DeskForm
        label="Add the item"
        variant="default"
        clear
        className="mt-6 space-y-4"
        onSend={(form) => act({ do: "add-item", name: value(form, "name"), blurb: value(form, "blurb"), price: value(form, "price"), shelf: value(form, "shelf") })}
      >
        <label className="block">
          <span className="label-mono text-muted-foreground">Name</span>
          <input name="name" maxLength={80} required autoComplete="off" className={FIELD} />
        </label>
        <label className="block">
          <span className="label-mono text-muted-foreground">One line about it</span>
          <input name="blurb" maxLength={200} autoComplete="off" className={FIELD} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <label className="block">
            <span className="label-mono text-muted-foreground">Price, in dollars</span>
            <input name="price" inputMode="decimal" required autoComplete="off" placeholder="12.00" className={cn(FIELD, "font-mono")} />
            <span className="mt-2 block text-sm leading-snug text-muted-foreground">At most {dollars(most)}.</span>
          </label>
          <ShelfSelect shelf={null} />
        </div>
      </DeskForm>
    </section>
  )
}

function Item({ item, act, canList }: { item: DeskItem; act: Act; canList: boolean }) {
  const [sure, setSure] = useState(false)
  const [cleared, setCleared] = useState<Said>({})
  const onShelf = item.active && !item.takenDown

  return (
    <section className={PANEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-2xl font-medium tracking-[-0.035em]">{item.name}</h2>
        <p className={cn("label-mono", item.takenDown ? "text-destructive" : onShelf ? "text-brand" : "text-muted-foreground")}>
          {item.takenDown ? "Taken down by the shop" : onShelf ? "On the shelf" : "Off the shelf"}
        </p>
      </div>
      <ul className="mt-5 flex flex-wrap gap-1.5">
        <li className="label-mono rounded-md bg-secondary px-3 py-2">{dollars(item.priceCents)}</li>
        <li className="label-mono rounded-md bg-secondary px-3 py-2">{item.free} to sell</li>
        <li className="label-mono rounded-md bg-secondary px-3 py-2">{item.held} set aside</li>
        <li className="label-mono rounded-md bg-secondary px-3 py-2">{item.given} handed over</li>
      </ul>
      {onShelf ? (
        <p className="mt-4 text-sm leading-snug text-muted-foreground">
          Its page:{" "}
          <Link href={`/shop/${item.slug}`} className="font-mono text-brand underline-offset-4 hover:underline">
            /shop/{item.slug}
          </Link>
        </p>
      ) : null}

      {item.takenDown ? (
        <p className="mt-6 max-w-xl leading-relaxed text-muted-foreground">
          The shop&apos;s owner took this item down. It cannot go back on the shelf and takes no codes. Orders of it that
          were already paid are still listed below.
        </p>
      ) : canList ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <DeskForm
            label="Save"
            className="space-y-4"
            onSend={(form) =>
              act({
                do: "save-item",
                id: item.id,
                name: value(form, "name"),
                blurb: value(form, "blurb"),
                price: value(form, "price"),
                shelf: value(form, "shelf"),
                active: form.get("active") === "yes",
              })
            }
          >
            <label className="block">
              <span className="label-mono text-muted-foreground">Name</span>
              <input name="name" defaultValue={item.name} maxLength={80} required autoComplete="off" className={FIELD} />
            </label>
            <label className="block">
              <span className="label-mono text-muted-foreground">One line about it</span>
              <input name="blurb" defaultValue={item.blurb} maxLength={200} autoComplete="off" className={FIELD} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label-mono text-muted-foreground">Price, in dollars</span>
                <input
                  name="price"
                  defaultValue={(item.priceCents / 100).toFixed(2)}
                  inputMode="decimal"
                  required
                  autoComplete="off"
                  className={cn(FIELD, "font-mono")}
                />
              </label>
              <ShelfSelect shelf={item.shelf} />
            </div>
            <label className="flex items-start gap-3 leading-snug">
              <input type="checkbox" name="active" value="yes" defaultChecked={item.active} className="mt-1 size-4 accent-[var(--primary)]" />
              <span>On the shelf: buyers can order it.</span>
            </label>
          </DeskForm>

          <div>
            <DeskForm label="Add the codes" clear className="space-y-4" onSend={(form) => act({ do: "add-codes", id: item.id, codes: value(form, "codes") })}>
              <label className="block">
                <span className="label-mono text-muted-foreground">Codes, one per line</span>
                <textarea name="codes" rows={5} required spellCheck={false} autoComplete="off" className={cn(FIELD, "font-mono leading-relaxed")} />
                <span className="mt-2 block text-sm leading-snug text-muted-foreground">
                  One code is handed over per order. A code is kept readable on the shop&apos;s server until its order is
                  paid, then sealed to the buyer and wiped. It is never shown here again.
                </span>
              </label>
            </DeskForm>
            {item.free > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (!sure) return setSure(true)
                    setSure(false)
                    setCleared(await act({ do: "clear-codes", id: item.id }))
                  }}
                >
                  {sure ? `Yes, remove ${item.free} unsold` : "Remove the unsold codes"}
                </Button>
                <p aria-live="polite" className={cn("text-sm leading-snug", cleared.error ? "text-destructive" : "text-muted-foreground")}>
                  {sure ? "They are deleted, not shown. Press again to do it." : (cleared.error ?? cleared.ok)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3.5 sm:grid-cols-[9rem_1fr]">
      <dt className="label-mono pt-0.5 text-muted-foreground">{name}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  )
}

function Address({ address, missing }: { address: string | null; missing: string }) {
  return address ? (
    <span className="flex flex-col items-start gap-2">
      <span className="font-mono text-xs break-all">{address}</span>
      <CopyButton text={address} variant="secondary" size="xs">
        Copy the address
      </CopyButton>
    </span>
  ) : (
    <span className="text-muted-foreground">{missing}</span>
  )
}

function Owed({ order, act }: { order: DeskOrder; act: Act }) {
  return (
    <section className={PANEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-2xl font-medium tracking-[-0.035em]">{order.product}</h2>
        <p className="label-mono text-destructive">You owe a refund</p>
      </div>
      <dl className="mt-6 space-y-1.5">
        <Row name="Order">{order.ref}</Row>
        <Row name="Owed back">
          <span className="inline-flex flex-wrap items-center gap-1.5 text-destructive">
            <ZecIcon className="size-3.5" />
            {formatZec(order.owedZat)} ZEC
          </span>
        </Row>
        <Row name="Send it to">
          <Address address={order.refundAddress} missing="The buyer has not given an address yet. They can, on the order's page." />
        </Row>
        <Row name="Why">{WHY[order.owedWhy ?? "no-item"]}</Row>
        <Row name="Arrived">
          {formatZec(order.receivedZat)} ZEC, for a price of {formatZec(order.zat)} ZEC ({dollars(order.priceCents)} at the time)
        </Row>
      </dl>
      <p className="mt-5 max-w-2xl text-sm leading-snug text-muted-foreground">
        The payment is in your wallet: check it there first. The amount here is what the payment engine saw. The shop cannot
        send this for you.
      </p>
      <DeskForm label="Mark it as sent" className="mt-5 space-y-4" onSend={(form) => act({ do: "refunded", ref: order.ref, sent: form.get("sent") === "yes" })}>
        <label className="flex items-start gap-3 leading-snug">
          <input type="checkbox" name="sent" value="yes" className="mt-1 size-4 accent-[var(--primary)]" />
          <span>The refund has left my wallet, less the network fee.</span>
        </label>
      </DeskForm>
    </section>
  )
}

function Report({ order, act }: { order: DeskOrder; act: Act }) {
  return (
    <section className={PANEL}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-2xl font-medium tracking-[-0.035em]">{order.product}</h2>
        <p className="label-mono text-destructive">Reported by the buyer</p>
      </div>
      <dl className="mt-6 space-y-1.5">
        <Row name="Order">{order.ref}</Row>
        <Row name="They wrote">
          <span className="font-sans text-base leading-relaxed break-words whitespace-pre-wrap">{order.problem?.note}</span>
        </Row>
        <Row name="A refund goes to">
          <Address address={order.refundAddress} missing="No address was given." />
        </Row>
        <Row name="Paid">
          {formatZec(order.receivedZat)} ZEC, for a price of {formatZec(order.zat)} ZEC ({dollars(order.priceCents)} at the time)
        </Row>
        <Row name="Handed over">{when(order.deliveredAt)}</Row>
        <Row name="Reported">{when(order.problem?.at ?? null)}</Row>
      </dl>
      <p className="mt-5 max-w-2xl text-sm leading-snug text-muted-foreground">
        The shop&apos;s owner reads this report too, and decides by reports like it whether an item stays on the shelf.
      </p>
      <DeskForm
        label="Answer the report"
        className="mt-5 space-y-4"
        onSend={(form) => act({ do: "answer", ref: order.ref, outcome: value(form, "outcome"), reply: value(form, "reply") })}
      >
        <label className="flex items-start gap-3 leading-snug">
          <input type="radio" name="outcome" value="refunded" className="mt-1 size-4 accent-[var(--primary)]" />
          <span>A refund has left my wallet for it, less the network fee.</span>
        </label>
        <label className="flex items-start gap-3 leading-snug">
          <input type="radio" name="outcome" value="none" className="mt-1 size-4 accent-[var(--primary)]" />
          <span>No refund.</span>
        </label>
        <label className="block">
          <span className="label-mono text-muted-foreground">A line for the buyer (optional)</span>
          <input name="reply" maxLength={300} autoComplete="off" className={FIELD} />
          <span className="mt-2 block text-sm leading-snug text-muted-foreground">
            Shown on the order&apos;s page, to whoever has its link. Say why, or what to try.
          </span>
        </label>
      </DeskForm>
    </section>
  )
}

function Orders({ orders }: { orders: DeskOrder[] }) {
  return (
    <section className={PANEL}>
      <DotLabel>Orders of your items</DotLabel>
      {orders.length === 0 ? (
        <p className="mt-5 leading-relaxed text-muted-foreground">None yet.</p>
      ) : (
        <ul className="mt-6 space-y-1.5">
          {orders.map((order) => (
            <li key={order.ref} className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_11rem_9rem]">
              <p className="min-w-0">
                <span className="block truncate font-medium">{order.product}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {order.ref} · {when(order.createdAt)}
                </span>
              </p>
              <p className={cn("label-mono self-center", order.state === "owed" ? "text-destructive" : order.state === "delivered" ? "text-brand" : "text-muted-foreground")}>
                {STATE[order.state]}
              </p>
              <p className="self-center font-mono text-sm sm:text-right">
                {order.receivedZat > 0 ? `${formatZec(order.receivedZat)} ZEC` : dollars(order.priceCents)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 max-w-2xl text-sm leading-snug text-muted-foreground">
        The newest hundred. An order is named here by a short code of its own, not by the buyer&apos;s link. Orders are deleted
        some days after they finish.
      </p>
    </section>
  )
}
