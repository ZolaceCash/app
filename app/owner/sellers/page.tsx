import type { Metadata } from "next";
import Link from "next/link";

import { closeTheSeller, takeItemDown } from "@/app/owner/actions";
import { ActionForm } from "@/components/owner/action-form";
import { dollars, OwnerFrame, Panel, when } from "@/components/owner/frame";
import { listProblems, listRefundsDue } from "@/lib/admin";
import { countToBuy } from "@/lib/orders";
import { requireOwner } from "@/lib/owner-session";
import { NOT_SOLD } from "@/lib/sell";
import { listSellers } from "@/lib/sellers";
import { sellerLimits, sellingOn } from "@/lib/selling";

export const metadata: Metadata = { title: "Sellers" };

const HOW = [
  "A seller's order is paid to the seller's wallet. You hold none of it, so you cannot refund it and it is never on your refunds screen.",
  "A buyer's report about a seller's item goes to the seller to answer. You read it here and decide whether the item stays.",
  "Taking an item down takes it off the shelf at once. Its seller cannot put it back; you can.",
  "Closing a seller takes all their items off the shelf and lets them list nothing. Their desk still opens, so they can deal with what they owe buyers.",
  "An order that was already paid still runs to its end either way.",
  "You cannot read a seller's codes, change their items or see their viewing key.",
];

// Who is asking is read from the request before any row of this screen is read.
export const instant = false;

export default async function OwnerSellers() {
  await requireOwner();
  const [sellers, due, problems, toBuy] = await Promise.all([listSellers(), listRefundsDue(), listProblems(), countToBuy()]);
  const open = sellingOn();
  const limits = sellerLimits();

  return (
    <OwnerFrame at="/owner/sellers" title="Sellers" due={due.length + problems.length} toBuy={toBuy}>
      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-2.5">
          <Panel>
            <p className={open ? "label-mono text-brand" : "label-mono text-muted-foreground"}>
              {open ? "Selling is open" : "Selling is switched off"}
            </p>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              {open
                ? `Anyone can sign up and list. An item costs at most ${dollars(limits.maxPriceCents)}, a seller lists at most ${limits.maxItems} items, and at most ${limits.sellers} sellers are taken.`
                : "Nobody can sign up and no seller's item is shown or sold. It opens where the server is told SELLING=open and real payments run."}
            </p>
          </Panel>

          {sellers.length === 0 ? (
            <Panel>
              <p className="label-mono text-muted-foreground">No sellers</p>
              <p className="mt-4 leading-relaxed">Nobody has signed up to sell.</p>
            </Panel>
          ) : (
            sellers.map((seller) => (
              <Panel key={seller.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h2 className="text-2xl font-medium tracking-[-0.035em]">
                    {seller.slug && open && !seller.closedAt ? (
                      <Link href={`/s/${seller.slug}`} className="underline-offset-4 hover:text-brand hover:underline">
                        {seller.name}
                      </Link>
                    ) : (
                      seller.name
                    )}
                  </h2>
                  <p className={seller.closedAt ? "label-mono text-destructive" : "label-mono text-muted-foreground"}>
                    {seller.closedAt ? `Closed ${when(seller.closedAt)}` : seller.network === "testnet" ? "Test network" : "Selling"}
                  </p>
                </div>
                <ul className="mt-5 flex flex-wrap gap-1.5">
                  <li className="label-mono rounded-md bg-secondary px-3 py-2">Since {when(seller.createdAt)}</li>
                  <li className="label-mono rounded-md bg-secondary px-3 py-2">{seller.delivered} handed over</li>
                  {seller.owedOrders > 0 ? (
                    <li className="label-mono rounded-md bg-destructive/20 px-3 py-2 text-destructive">
                      {seller.owedOrders} refund{seller.owedOrders === 1 ? "" : "s"} not sent
                    </li>
                  ) : null}
                  {seller.reports.length > 0 ? (
                    <li className="label-mono rounded-md bg-destructive/20 px-3 py-2 text-destructive">
                      {seller.reports.length} report{seller.reports.length === 1 ? "" : "s"} unanswered
                    </li>
                  ) : null}
                </ul>

                {seller.reports.length > 0 ? (
                  <ul className="mt-6 space-y-1.5">
                    {seller.reports.map((report) => (
                      <li key={`${report.at}-${report.product}`} className="rounded-lg bg-secondary px-5 py-3.5">
                        <p className="label-mono text-destructive">
                          Reported: {report.product} · {when(report.at)}
                        </p>
                        <p className="mt-2 leading-relaxed break-words whitespace-pre-wrap">{report.note}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {seller.items.length === 0 ? (
                  <p className="mt-6 leading-relaxed text-muted-foreground">No items listed.</p>
                ) : (
                  <ul className="mt-6 space-y-1.5">
                    {seller.items.map((item) => (
                      <li key={item.id} className="rounded-lg bg-secondary px-5 py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                          <p className="font-medium">
                            {item.active && !item.takenDown && !seller.closedAt ? (
                              <Link href={`/shop/${item.slug}`} className="underline-offset-4 hover:text-brand hover:underline">
                                {item.name}
                              </Link>
                            ) : (
                              item.name
                            )}
                          </p>
                          <p className="label-mono text-muted-foreground">
                            {dollars(item.priceCents)} · {item.free} to sell ·{" "}
                            <span className={item.takenDown ? "text-destructive" : undefined}>
                              {item.takenDown ? "taken down" : item.active ? "on the shelf" : "off the shelf"}
                            </span>
                          </p>
                        </div>
                        <ActionForm
                          action={takeItemDown}
                          label={item.takenDown ? "Give it back to the seller" : "Take it down"}
                          variant="secondary"
                          size="sm"
                          className="mt-3"
                        >
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="down" value={item.takenDown ? "no" : "yes"} />
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                )}

                <ActionForm
                  action={closeTheSeller}
                  label={seller.closedAt ? "Open this seller again" : "Close this seller"}
                  variant="outline"
                  className="mt-6 space-y-4"
                >
                  <input type="hidden" name="id" value={seller.id} />
                  <input type="hidden" name="closed" value={seller.closedAt ? "no" : "yes"} />
                  {seller.closedAt ? null : (
                    <label className="flex items-start gap-3 leading-snug">
                      <input type="checkbox" name="sure" value="yes" className="mt-1 size-4 accent-[var(--primary)]" />
                      <span>Take everything of this seller&apos;s off the shelf.</span>
                    </label>
                  )}
                </ActionForm>
              </Panel>
            ))
          )}
        </div>

        <div className="space-y-2.5 lg:sticky lg:top-24">
          <Panel className="bg-ice text-ink">
            <p className="label-mono">Looking after sellers</p>
            <ul className="mt-6 space-y-4 leading-snug">
              {HOW.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <p className="label-mono text-muted-foreground">Not sold here</p>
            <ul className="mt-5 space-y-2 leading-snug">
              {NOT_SOLD.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </OwnerFrame>
  );
}
