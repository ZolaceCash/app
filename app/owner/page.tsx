import type { Metadata } from "next";

import { dollars, OwnerFrame, Panel, when } from "@/components/owner/frame";
import { ZecIcon } from "@/components/site/chain-icons";
import { countOrders, listOrders, listRefundsDue } from "@/lib/admin";
import type { Order } from "@/lib/db/schema";
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
  const [orders, counts, due] = await Promise.all([listOrders(), countOrders(), listRefundsDue()]);

  return (
    <OwnerFrame at="/owner" title="Orders" due={due.length}>
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
