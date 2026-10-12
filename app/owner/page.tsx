import type { Metadata } from "next";

import { cannotBuyItem, handOverItem } from "@/app/owner/actions";
import { testNotice } from "@/app/owner/notice-actions";
import { ActionForm } from "@/components/owner/action-form";
import { dollars, OwnerFrame, Panel, when } from "@/components/owner/frame";
import { ZecIcon } from "@/components/site/chain-icons";
import { countOrders, listOrders, listProblems, listRefundsDue } from "@/lib/admin";
import type { Order } from "@/lib/db/schema";
import { HAND_CODE_MAX, handHours, listToBuy } from "@/lib/orders";
import { noticesOn } from "@/lib/owner-notify";
import { requireOwner } from "@/lib/owner-session";
import { formatZec } from "@/lib/price";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orders · Owner" };

// The states the owner counts at a glance. "Owed" is an order that was paid and not delivered: a
// refund is due. (A delivered order that was overpaid is owed its excess too: the Refunds screen
// lists both, and the number on its tab counts both.)
const STATES: { state: Order["state"]; name: string }[] = [
  { state: "waiting", name: "Waiting" },
  { state: "seen", name: "Seen" },
  { state: "owed", name: "Refund due" },
  { state: "delivered", name: "Delivered" },
  { state: "expired", name: "Expired" },
  { state: "refunded", name: "Refunded" },
];

const NAME: Record<Order["state"], string> = {
  waiting: "Waiting",
  underpaid: "Underpaid",
  seen: "Seen",
  confirmed: "Confirming",
  delivered: "Delivered",
  expired: "Expired",
  owed: "Refund due",
  refunded: "Refunded",
};

// Who is asking is read from the request before any row of this screen is read, so someone who
// is not signed in is sent to the sign-in page and is shown nothing of it. (A built site answers
// 200 with the site's frame and redirects in the page; the dev server answers with a 307.)
export const instant = false;

export default async function OwnerOrders() {
  await requireOwner();
  // The list of things to buy is read first: it moves paid orders along, and the counts below
  // should already show that.
  const toBuy = await listToBuy();
  const [orders, counts, due, problems] = await Promise.all([listOrders(), countOrders(), listRefundsDue(), listProblems()]);

  return (
    <OwnerFrame at="/owner" title="Orders" due={due.length + problems.length} toBuy={toBuy.length}>
      {toBuy.length > 0 ? (
        <div className="mb-2.5 grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="space-y-2.5">
            {toBuy.map((order) => (
              <Panel key={order.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h2 className="text-2xl font-medium tracking-[-0.035em]">{order.product}</h2>
                  <p className="label-mono text-brand">Paid: buy it now</p>
                </div>
                <dl className="mt-6 space-y-1.5">
                  {(
                    [
                      ["Order", order.id],
                      [
                        "Paid",
                        order.test
                          ? "A test order: no money was paid. Hand over a made-up item to try this."
                          : `${formatZec(order.receivedZat)} ZEC, for a price of ${formatZec(order.zat)} ZEC (${dollars(order.priceCents)} at the time)`,
                      ],
                      ["Confirmed", when(order.readyAt)],
                      ["Hand it over by", when(order.handBy)],
                    ] as const
                  ).map(([name, value]) => (
                    <div key={name} className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3.5 sm:grid-cols-[9rem_1fr]">
                      <dt className="label-mono pt-0.5 text-muted-foreground">{name}</dt>
                      <dd className="font-mono text-sm break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
                <ActionForm action={handOverItem} label="Hand it over" busyLabel="Sealing" className="mt-6 space-y-4">
                  <input type="hidden" name="id" value={order.id} />
                  <label className="block">
                    <span className="label-mono text-muted-foreground">The item, as the buyer should get it</span>
                    <textarea
                      name="code"
                      rows={3}
                      required
                      maxLength={HAND_CODE_MAX}
                      spellCheck={false}
                      autoComplete="off"
                      className="mt-2 w-full rounded-lg bg-secondary px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"
                    />
                    <span className="mt-2 block text-sm leading-snug text-muted-foreground">
                      The code, and a PIN or a link if it comes with one. It is sealed to the buyer&apos;s key when you
                      press the button and is not kept readable here: check it before you do.
                    </span>
                  </label>
                </ActionForm>
                <ActionForm action={cannotBuyItem} label="Owe the payment back" variant="secondary" className="mt-6 space-y-4">
                  <input type="hidden" name="id" value={order.id} />
                  <label className="flex items-start gap-3 leading-snug">
                    <input type="checkbox" name="sure" value="yes" className="mt-1 size-4 accent-[var(--primary)]" />
                    <span>I cannot buy this item. All of the payment is owed back.</span>
                  </label>
                </ActionForm>
              </Panel>
            ))}
          </div>
          <Panel className="bg-ice text-ink lg:sticky lg:top-24">
            <p className="label-mono">Buying for an order</p>
            <ul className="mt-6 space-y-4 leading-snug">
              <li>An order is listed here once its payment is three blocks deep. Buy nothing for an order that is not on this list.</li>
              <li>Check that the payment is in your own wallet, then buy the item and paste it here.</li>
              <li>You have {handHours()} hours from the confirmation. After that the order leaves this list and the payment is owed back.</li>
              <li>What you paste is sealed for the buyer at once. The server cannot show it to you again.</li>
            </ul>
          </Panel>
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
        {STATES.map(({ state, name }) => (
          <li key={state} className="cut rounded-3xl bg-card p-5">
            <p className="label-mono text-muted-foreground">{name}</p>
            <p
              className={cn(
                "mt-6 font-mono text-4xl font-medium tracking-[-0.04em]",
                state === "owed" && (counts.owed ?? 0) > 0 && "text-destructive"
              )}
            >
              {counts[state] ?? 0}
            </p>
          </li>
        ))}
      </ul>

      <Panel className="mt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div className="max-w-xl">
            <p className="label-mono text-muted-foreground">Notices: {noticesOn() ? "on" : "off"}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {noticesOn()
                ? "This server tells your phone when an order is paid and waits for its item, when a buyer reports a problem and when a refund is due. A notice names no order, no item and no amount."
                : "Set OWNER_NOTIFY_URL where the server runs and it tells your phone when an order is paid and waits for its item, when a buyer reports a problem and when a refund is due. Until then nothing reaches you: look here."}
            </p>
          </div>
          {noticesOn() ? <ActionForm action={testNotice} label="Send a test notice" busyLabel="Sending" variant="secondary" /> : null}
        </div>
      </Panel>

      <Panel className="mt-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-2xl font-medium tracking-[-0.035em]">The newest {orders.length}</h2>
          <p className="max-w-md text-sm leading-snug text-muted-foreground">
            This is all the server has on an order. It has no name, no email and no paying address,
            and it cannot open an item.
          </p>
        </div>

        {orders.length === 0 ? (
          <p className="mt-6 rounded-lg bg-secondary px-5 py-4 text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="mt-6 space-y-1.5">
            {orders.map((order) => (
              <li
                key={order.id}
                className="grid grid-cols-2 items-center gap-x-6 gap-y-2 rounded-lg bg-secondary px-5 py-3.5 lg:grid-cols-[6rem_minmax(0,1.4fr)_7rem_5rem_8rem_minmax(0,1fr)]"
              >
                <span className="font-mono text-xs text-brand">{order.id.slice(0, 8)}</span>
                <span className="truncate font-medium">
                  {order.product}
                  {order.test ? <span className="label-mono ml-2 text-muted-foreground">Test</span> : null}
                </span>
                <span
                  className={cn("label-mono", order.state === "owed" ? "text-destructive" : "text-muted-foreground")}
                >
                  {NAME[order.state]}
                </span>
                <span className="font-mono text-sm">{dollars(order.priceCents)}</span>
                <span className="flex items-center gap-1.5 font-mono text-sm">
                  <ZecIcon className="size-3.5 text-brand" />
                  {formatZec(order.zat)}
                </span>
                <span className="font-mono text-xs text-muted-foreground lg:text-right">{when(order.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </OwnerFrame>
  );
}
