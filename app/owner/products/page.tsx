import type { Metadata } from "next";
import Link from "next/link";

import { addItem, saveItem, uploadCodes } from "@/app/owner/actions";
import { ActionForm } from "@/components/owner/action-form";
import { dollars, Field, OwnerFrame, Panel } from "@/components/owner/frame";
import { listProblems, listProducts, listRefundsDue, MAX_CODES_AT_ONCE } from "@/lib/admin";
import { SHELVES } from "@/lib/catalog";
import { countToBuy } from "@/lib/orders";
import { requireOwner } from "@/lib/owner-session";
import { shopMode } from "@/lib/shop-mode";
import { balanceCents, supplierOn, wholesaleCents } from "@/lib/supplier";

export const metadata: Metadata = { title: "Items" };

// Who is asking is read from the request before any row of this screen is read, so someone who
// is not signed in is sent to the sign-in page and is shown nothing of it. (A built site answers
// 200 with the site's frame and redirects in the page; the dev server answers with a 307.)
export const instant = false;

// What an item made by the supplier costs the owner right now, against what the shop asks for it.
// Asked of the supplier when this screen is opened: its prices move, and a price here that falls
// under the cost stops the item from being sold (lib/orders.ts).
async function Supplied({ product }: { product: { supplierRef: string | null; priceCents: number } }) {
  const on = supplierOn();
  const cost = on && product.supplierRef ? await wholesaleCents(product.supplierRef) : null;
  const left = on ? await balanceCents() : null;
  const rows: [string, string, boolean][] = [
    ["Supplier's package", product.supplierRef ?? "none", !product.supplierRef],
    [
      "Costs you now",
      !on ? "ESIMACCESS_CODE is not set" : cost === null ? "not on the supplier's list" : dollars(cost),
      !on || cost === null,
    ],
    [
      "Left of each sale",
      cost === null ? "n/a" : dollars(product.priceCents - cost),
      cost !== null && cost > product.priceCents,
    ],
    ["Your balance there", left === null ? "n/a" : dollars(left), left !== null && cost !== null && left < cost],
  ];
  return (
    <>
      <dl className="mt-6 grid grid-cols-2 gap-1.5 md:grid-cols-4">
        {rows.map(([name, value, bad]) => (
          <div key={name} className="rounded-lg bg-secondary px-4 py-3.5">
            <dt className="label-mono text-muted-foreground">{name}</dt>
            <dd className={bad ? "mt-3 font-mono text-sm font-medium text-destructive" : "mt-3 font-mono text-sm font-medium"}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm leading-snug text-muted-foreground">
        Bought from the supplier when an order is paid, out of your balance there. It is not sold while it costs
        you more than its price, while the balance does not cover it, or where only test orders are taken.
      </p>
    </>
  );
}

// Which shelf of the shop an item stands on. The shop marks a shelf as on sale while an item on
// it can be ordered; an item on none is still in the list of items.
function ShelfField({ value }: { value: string | null }) {
  return (
    <label className="block">
      <span className="label-mono text-muted-foreground">Shelf</span>
      <select
        name="shelf"
        defaultValue={value ?? ""}
        className="mt-2 h-11 w-full rounded-lg bg-secondary px-4 font-mono text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <option value="">On none</option>
        {SHELVES.map((shelf) => (
          <option key={shelf.slug} value={shelf.slug}>
            {shelf.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function OwnerProducts() {
  await requireOwner();
  const [products, due, problems, toBuy] = await Promise.all([listProducts(), listRefundsDue(), listProblems(), countToBuy()]);

  return (
    <OwnerFrame at="/owner/products" title="Items" due={due.length + problems.length} toBuy={toBuy}>
      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-2.5">
          {products.map((product) => (
            <Panel key={product.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="text-2xl font-medium tracking-[-0.035em]">{product.name}</h2>
                <p className="label-mono flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span className="rounded-md bg-secondary px-2.5 py-1.5">
                    {{ test: "Test item", supplier: "Made when paid", hand: "Bought when paid", stock: "From stock" }[product.kind]}
                  </span>
                  <span
                    className={
                      product.active
                        ? "rounded-md bg-accent px-2.5 py-1.5 text-accent-foreground"
                        : "rounded-md bg-secondary px-2.5 py-1.5"
                    }
                  >
                    {product.active ? "On the shelf" : "Off the shelf"}
                  </span>
                </p>
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {product.active ? (
                  <Link href={`/shop/${product.slug}`} className="text-brand underline-offset-4 hover:underline">
                    /shop/{product.slug}
                  </Link>
                ) : (
                  `/shop/${product.slug}`
                )}
                {" · "}
                {dollars(product.priceCents)}
              </p>

              {product.kind === "supplier" ? <Supplied product={product} /> : null}

              {/* How many codes there are. The codes themselves are never shown here. */}
              <dl className={product.kind === "supplier" || product.kind === "hand" ? "hidden" : "mt-6 grid grid-cols-3 gap-1.5"}>
                {(
                  [
                    ["On the shelf", product.free],
                    ["Held for an order", product.held],
                    ["Handed over", product.given],
                  ] as const
                ).map(([name, count]) => (
                  <div key={name} className="rounded-lg bg-secondary px-4 py-3.5">
                    <dt className="label-mono text-muted-foreground">{name}</dt>
                    <dd className="mt-3 font-mono text-2xl font-medium tracking-[-0.04em]">
                      {product.kind === "test" && name === "On the shelf" ? "n/a" : count}
                    </dd>
                  </div>
                ))}
              </dl>

              <ActionForm action={saveItem} label="Save" busyLabel="Saving" variant="secondary" className="mt-6 space-y-4">
                <input type="hidden" name="id" value={product.id} />
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <Field label="Name" name="name" defaultValue={product.name} maxLength={80} required />
                  <Field
                    label="Price in dollars"
                    name="price"
                    defaultValue={(product.priceCents / 100).toFixed(2)}
                    inputMode="decimal"
                    required
                  />
                </div>
                <Field label="One line about it" name="blurb" defaultValue={product.blurb} maxLength={200} />
                <ShelfField value={product.shelf} />
                <label className="flex items-center gap-3 leading-snug">
                  <input
                    type="checkbox"
                    name="active"
                    value="yes"
                    defaultChecked={product.active}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <span>On the shelf</span>
                </label>
              </ActionForm>

              {product.kind === "stock" ? (
                <ActionForm
                  action={uploadCodes}
                  label="Add these codes"
                  busyLabel="Adding"
                  variant="secondary"
                  className="mt-8 space-y-4"
                >
                  <input type="hidden" name="id" value={product.id} />
                  <label className="block">
                    <span className="label-mono text-muted-foreground">Codes, one per line</span>
                    <textarea
                      name="codes"
                      rows={5}
                      required
                      spellCheck={false}
                      autoComplete="off"
                      className="mt-2 w-full rounded-lg bg-secondary px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"
                    />
                    <span className="mt-2 block text-sm leading-snug text-muted-foreground">
                      Up to {MAX_CODES_AT_ONCE} at once. A code stays readable on the server until it is
                      handed over, and is wiped then.
                    </span>
                  </label>
                </ActionForm>
              ) : product.kind === "hand" ? (
                <p className="mt-8 rounded-lg bg-secondary px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                  Nothing is uploaded for this item. An order for it shows on the orders screen once its payment
                  is three blocks deep: buy the item then, and hand it over there. Take it off the shelf while
                  you cannot look.
                </p>
              ) : product.kind === "test" ? (
                <p className="mt-8 rounded-lg bg-secondary px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                  A test item takes no stock: its code is made up at checkout and unlocks nothing.
                </p>
              ) : null}
            </Panel>
          ))}
        </div>

        <Panel className="lg:sticky lg:top-24">
          <p className="label-mono text-muted-foreground">A new item</p>
          <ActionForm action={addItem} label="Add the item" busyLabel="Adding" className="mt-6 space-y-4">
            <Field label="Name" name="name" maxLength={80} required />
            <Field
              label="Name in links"
              name="slug"
              maxLength={60}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="game-voucher"
              hint="Lower-case letters, digits and dashes. It cannot be changed afterwards."
            />
            <Field label="Price in dollars" name="price" inputMode="decimal" placeholder="12.50" required />
            <Field label="One line about it" name="blurb" maxLength={200} />
            <ShelfField value={null} />
            <Field
              label="Supplier's package (optional)"
              name="supplierRef"
              maxLength={40}
              spellCheck={false}
              placeholder="JP_5_30"
              hint="Leave empty for an item you upload codes for. Filled in, the item is an eSIM bought from eSIM Access when its order is paid: give the package's code or slug from their price list."
            />
            <label className="flex items-start gap-3 leading-snug">
              <input type="checkbox" name="byHand" value="yes" className="mt-1 size-4 accent-[var(--primary)]" />
              <span>
                I buy it myself after the order is paid.
                <span className="mt-1 block text-sm text-muted-foreground">
                  No codes are uploaded. A paid order waits on the orders screen for you to buy the item and
                  hand it over.
                </span>
              </span>
            </label>
          </ActionForm>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            A new item is handed over from codes you upload, and starts off the shelf.{" "}
            {
              {
                preview: "Nothing real can be sold yet: every order is still a test order.",
                testnet: "Orders are paid in test coins for now, so nothing real is sold yet.",
                open: "Once it is on the shelf with a code in stock, it is sold for real ZEC.",
              }[shopMode()]
            }
          </p>
        </Panel>
      </div>
    </OwnerFrame>
  );
}
