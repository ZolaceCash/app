import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { BuyButton } from "@/components/shop/buy-button";
import { shopWords } from "@/lib/shop-mode";
import { ZecIcon } from "@/components/site/chain-icons";
import { PageShell } from "@/components/site/page-shell";
import { DotLabel, PillLink } from "@/components/site/primitives";
import { getItem, type ShelfItem } from "@/lib/orders";

export const metadata: Metadata = {
  title: "An item",
  description: "One item on the shelf at Zolace: its price, how it is paid and how it reaches you.",
};

// An item is read from the database, so it is not known before the request. The page waits for
// it instead of showing a frame first, and an item that is not there gets the not-found page.
// (The dev server answers that with a 404; a built site sends the site's frame first, so the
// status is 200 and the page says it was not found and asks not to be indexed.)
export const instant = false;

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const STEPS = [
  { name: "No account", body: "Checkout asks nothing about you. The order gets a link, and the link is the receipt." },
  { name: "Price held 15 minutes", body: "The price is set in dollars and held in ZEC while you pay." },
  { name: "Paid in shielded ZEC", body: "From your own wallet, to an address made for this one order." },
  { name: "Opened in your browser", body: "The item is sealed to a key your browser made. The server keeps a copy it cannot read." },
];

export default async function ItemPage({ params }: PageProps<"/shop/[slug]">) {
  const { slug } = await params;
  await connection();

  let item: ShelfItem | null;
  try {
    item = slug.length <= 60 ? await getItem(slug) : null;
  } catch {
    return (
      <PageShell>
        <p className="cut rounded-3xl bg-card p-6 leading-relaxed text-muted-foreground">
          The shop cannot reach its database right now, so this item cannot be shown. The rest of
          the site is unaffected.
        </p>
      </PageShell>
    );
  }
  if (!item) notFound();

  return (
    <PageShell>
      <Item item={item} />
    </PageShell>
  );
}

function Item({ item }: { item: ShelfItem }) {
  const test = item.kind === "test";
  const soldOut = !test && item.left === 0;

  return (
    <div className="enter grid items-start gap-2.5 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <div className="cut-2 rounded-3xl bg-card p-7 md:p-12">
        <DotLabel>
          <span className="text-muted-foreground">The shop /</span>
          {test ? "Test item" : item.kind === "supplier" ? "Made to order" : "From stock"}
        </DotLabel>
        <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-6xl">
          {item.name}
        </h1>
        {item.blurb ? (
          <p className="mt-6 max-w-xl leading-relaxed text-pretty text-muted-foreground">{item.blurb}</p>
        ) : null}

        <p className="mt-10 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="font-mono text-5xl font-medium tracking-[-0.05em] md:text-6xl">{dollars(item.priceCents)}</span>
          <span className="label-mono flex items-center gap-1.5 text-muted-foreground">
            <ZecIcon className="size-3.5 text-brand" />
            paid in ZEC
          </span>
        </p>

        <p className="label-mono mt-6 inline-flex rounded-md bg-accent px-3 py-2 text-accent-foreground">
          {test
            ? "Made up at checkout: it unlocks nothing"
            : item.kind === "supplier"
              ? "Made for you when the order is paid"
              : soldOut
                ? "None left"
                : `${item.left} left`}
        </p>

        <div className="mt-8 flex flex-wrap items-start gap-2">
          {soldOut ? (
            <p className="max-w-md leading-relaxed text-muted-foreground">
              Every code of this item is gone or set aside for an order. One comes back if an order
              runs out of time.
            </p>
          ) : (
            <BuyButton slug={item.slug} label={shopWords().order} />
          )}
          <PillLink href="/shop" variant="secondary">
            All items
          </PillLink>
        </div>

        <p className="mt-8 max-w-xl rounded-xl bg-secondary p-5 text-sm leading-relaxed text-muted-foreground">
          <span className="label-mono mb-2 block text-foreground">{shopWords().noteLabel}</span>
          {shopWords().note}
        </p>

        {item.shelf === "esim" ? (
          <p className="mt-2.5 max-w-xl rounded-xl bg-secondary p-5 text-sm leading-relaxed text-muted-foreground">
            <span className="label-mono mb-2 block text-foreground">Before you buy an eSIM</span>
            Your phone has to take an eSIM and must not be locked to a carrier. Dial *#06#: if the
            answer lists an EID, it takes one. Treat the QR code as good for one install, on one
            phone.
          </p>
        ) : null}
      </div>

      <ol className="space-y-2.5">
        {STEPS.map((step, index) => (
          <li key={step.name} className="cut rounded-3xl bg-card p-6">
            <p className="label-mono text-muted-foreground">0{index + 1}</p>
            <p className="mt-5 text-lg font-medium tracking-[-0.03em]">{step.name}</p>
            <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
