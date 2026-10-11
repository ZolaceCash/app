import type { Metadata } from "next";
import type { ReactNode } from "react";

import { answerReport, refundSent } from "@/app/owner/actions";
import { ActionForm } from "@/components/owner/action-form";
import { dollars, Field, OwnerFrame, Panel, when } from "@/components/owner/frame";
import { ZecIcon } from "@/components/site/chain-icons";
import { CopyButton } from "@/components/site/copy-button";
import { listProblems, listRefundsDue, REPLY_MAX } from "@/lib/admin";
import { countToBuy, owedWhy, type OwedWhy } from "@/lib/orders";
import { requireOwner } from "@/lib/owner-session";
import { formatZec } from "@/lib/price";

export const metadata: Metadata = { title: "Refunds" };

const HOW = [
  "An order lands here when money arrived that the shop may not keep: too little, too late, with no item left to hand over, or more than the price.",
  "Check each one in your own wallet before sending anything back. The amount here is what the payment engine saw.",
  "The buyer gives a shielded address on the order's page. A shielded payment names no sender, so it cannot simply be sent back. An order with no address yet stays here until there is one.",
  "You send the refund from your own wallet. The server cannot: it holds no key that can spend.",
  "Taking an order off the queue only records that you did. It moves no money.",
  "A report is a buyer saying the item they were handed does not work. Nothing is owed until you decide: answer it with a refund you sent, or without one, and a line saying why.",
];

const WHY: Record<OwedWhy, string> = {
  short: "Less than the price arrived before the price lock ran out. Nothing was handed over.",
  late: "The payment arrived after the price lock ran out. Nothing was handed over.",
  "no-item": "Paid in full and in time, and nothing was handed over: none was left, or it was not bought in time.",
  excess: "The item was handed over. More than the price was paid: only the excess is owed.",
};

// Who is asking is read from the request before any row of this screen is read, so someone who
// is not signed in is sent to the sign-in page and is shown nothing of it. (A built site answers
// 200 with the site's frame and redirects in the page; the dev server answers with a 307.)
export const instant = false;

export default async function OwnerRefunds() {
  await requireOwner();
  const [due, problems, toBuy] = await Promise.all([listRefundsDue(), listProblems(), countToBuy()]);

  return (
    <OwnerFrame at="/owner/refunds" title="Refunds" due={due.length + problems.length} toBuy={toBuy}>
      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-2.5">
          {problems.map((problem) => (
            <Panel key={problem.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="text-2xl font-medium tracking-[-0.035em]">{problem.product}</h2>
                <p className="label-mono text-destructive">Reported by the buyer</p>
              </div>
              <dl className="mt-6 space-y-1.5">
                <Row name="Order">
                  <span className="break-all">{problem.id}</span>
                </Row>
                <Row name="They wrote">
                  <span className="font-sans text-base leading-relaxed break-words whitespace-pre-wrap">{problem.note}</span>
                </Row>
                <Row name="A refund goes to">
                  {problem.refundAddress ? (
                    <span className="flex flex-col items-start gap-2">
                      <span className="font-mono text-xs break-all">{problem.refundAddress}</span>
                      <CopyButton text={problem.refundAddress} variant="secondary" size="xs">
                        Copy the address
                      </CopyButton>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No address was given.</span>
                  )}
                </Row>
                <Row name="Paid">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <ZecIcon className="size-3.5" />
                    {formatZec(problem.receivedZat)} ZEC, for a price of {formatZec(problem.zat)} ZEC ({dollars(problem.priceCents)} at the time)
                  </span>
                </Row>
                <Row name="Handed over">{when(problem.deliveredAt)}</Row>
                <Row name="Reported">{when(problem.reportedAt)}</Row>
              </dl>
              <ActionForm action={answerReport} label="Answer the report" variant="secondary" className="mt-6 space-y-4">
                <input type="hidden" name="id" value={problem.id} />
                <label className="flex items-start gap-3 leading-snug">
                  <input type="radio" name="outcome" value="refunded" className="mt-1 size-4 accent-[var(--primary)]" />
                  <span>A refund has left my wallet for it, less the network fee.</span>
                </label>
                <label className="flex items-start gap-3 leading-snug">
                  <input type="radio" name="outcome" value="none" className="mt-1 size-4 accent-[var(--primary)]" />
                  <span>No refund.</span>
                </label>
                <Field
                  label="A line for the buyer (optional)"
                  name="reply"
                  maxLength={REPLY_MAX}
                  hint="Shown on the order's page, to whoever has its link. Say why, or what to try."
                />
              </ActionForm>
            </Panel>
          ))}
          {due.length === 0 && problems.length > 0 ? null : due.length === 0 ? (
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
                  <Row name="Owed back">
                    <span className="inline-flex flex-wrap items-center gap-1.5 text-destructive">
                      <ZecIcon className="size-3.5" />
                      {formatZec(order.owedZat)} ZEC
                    </span>
                  </Row>
                  <Row name="Send it to">
                    {order.refundAddress ? (
                      <span className="flex flex-col items-start gap-2">
                        <span className="font-mono text-xs break-all">{order.refundAddress}</span>
                        <CopyButton text={order.refundAddress} variant="secondary" size="xs">
                          Copy the address
                        </CopyButton>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        The buyer has not given an address yet. They can, on the order&apos;s page.
                      </span>
                    )}
                  </Row>
                  <Row name="Why">{WHY[owedWhy(order) ?? "no-item"]}</Row>
                  <Row name="Arrived">
                    {formatZec(order.receivedZat)} ZEC, for a price of {formatZec(order.zat)} ZEC ({dollars(order.priceCents)} at the time)
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
