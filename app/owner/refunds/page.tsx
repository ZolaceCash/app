import type { Metadata } from "next";
import type { ReactNode } from "react";

import { refundSent } from "@/app/owner/actions";
import { ActionForm } from "@/components/owner/action-form";
import { dollars, OwnerFrame, Panel, when } from "@/components/owner/frame";
import { ZecIcon } from "@/components/site/chain-icons";
import { listRefundsDue } from "@/lib/admin";
import { requireOwner } from "@/lib/owner-session";
import { formatZec } from "@/lib/price";

export const metadata: Metadata = { title: "Refunds" };

const HOW = [
  "An order lands here when it was paid and there was nothing to hand over.",
  "The buyer gives an address to refund to. A shielded payment names no sender, so it cannot simply be sent back.",
  "You send the refund from your own wallet. The server cannot: it holds no key that can spend.",
  "Taking an order off the queue only records that you did. It moves no money.",
];

// Who is asking is read from the request before any row of this screen is read, so someone who
// is not signed in is sent to the sign-in page and is shown nothing of it. (A built site answers
// 200 with the site's frame and redirects in the page; the dev server answers with a 307.)
export const instant = false;

export default async function OwnerRefunds() {
  await requireOwner();
  const due = await listRefundsDue();

  return (
    <OwnerFrame at="/owner/refunds" title="Refunds" due={due.length}>
      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-2.5">
          {due.length === 0 ? (
            <Panel>
              <p className="label-mono text-muted-foreground">Nothing owed</p>
              <p className="mt-4 leading-relaxed">No order is waiting for a refund.</p>
            </Panel>
          ) : (
            due.map((order) => (
              <Panel key={order.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h2 className="text-2xl font-medium tracking-[-0.035em]">{order.product}</h2>
                  <p className="label-mono text-destructive">Refund due</p>
                </div>
                <dl className="mt-6 space-y-1.5">
                  <Row name="Order">
                    <span className="break-all">{order.id}</span>
                  </Row>
                  <Row name="Paid">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <ZecIcon className="size-3.5 text-brand" />
                      {formatZec(order.zat)} ZEC, for {dollars(order.priceCents)} at the time
                    </span>
                  </Row>
                  <Row name="Payment seen">{when(order.seenAt)}</Row>
                  {order.test ? <Row name="Kind">A test order. No money was paid, so none is owed.</Row> : null}
                </dl>
                <ActionForm
                  action={refundSent}
                  label="Take it off the queue"
                  variant="secondary"
                  className="mt-6 space-y-4"
                >
                  <input type="hidden" name="id" value={order.id} />
                  <label className="flex items-start gap-3 leading-snug">
                    <input type="checkbox" name="sent" value="yes" className="mt-1 size-4 accent-[var(--primary)]" />
                    <span>The refund has left my wallet, less the network fee.</span>
                  </label>
                </ActionForm>
              </Panel>
            ))
          )}
        </div>

        <Panel className="bg-ice text-ink lg:sticky lg:top-24">
          <p className="label-mono">How a refund goes</p>
          <ul className="mt-6 space-y-4 leading-snug">
            {HOW.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </OwnerFrame>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3.5 sm:grid-cols-[9rem_1fr]">
      <dt className="label-mono pt-0.5 text-muted-foreground">{name}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  );
}
