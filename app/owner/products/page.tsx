import type { Metadata } from "next";
import Link from "next/link";

import { addItem, saveItem, uploadCodes } from "@/app/owner/actions";
import { ActionForm } from "@/components/owner/action-form";
import { dollars, Field, OwnerFrame, Panel } from "@/components/owner/frame";
import { listProducts, listRefundsDue, MAX_CODES_AT_ONCE } from "@/lib/admin";
import { requireOwner } from "@/lib/owner-session";

export const metadata: Metadata = { title: "Items" };

// Who is asking is read from the request before any row of this screen is read, so someone who
// is not signed in is sent to the sign-in page and is shown nothing of it. (A built site answers
// 200 with the site's frame and redirects in the page; the dev server answers with a 307.)
export const instant = false;

export default async function OwnerProducts() {
  await requireOwner();
  const [products, due] = await Promise.all([listProducts(), listRefundsDue()]);

  return (
    <OwnerFrame at="/owner/products" title="Items" due={due.length}>
      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-2.5">
          {products.map((product) => (
            <Panel key={product.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="text-2xl font-medium tracking-[-0.035em]">{product.name}</h2>
                <p className="label-mono flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span className="rounded-md bg-secondary px-2.5 py-1.5">
                    {product.kind === "test" ? "Test item" : "From stock"}
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

              {/* How many codes there are. The codes themselves are never shown here. */}
              <dl className="mt-6 grid grid-cols-3 gap-1.5">
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
              ) : (
                <p className="mt-8 rounded-lg bg-secondary px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                  A test item takes no stock: its code is made up at checkout and unlocks nothing.
                </p>
              )}
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
          </ActionForm>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            A new item is handed over from codes you upload, and starts off the shelf. Nothing real
            can be sold yet: every order is still a test order.
          </p>
        </Panel>
      </div>
    </OwnerFrame>
  );
}
