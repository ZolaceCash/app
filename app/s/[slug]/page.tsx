import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ItemCards } from "@/components/shop/test-items";
import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
import { storefront, type Storefront } from "@/lib/sellers";
import { shopWords } from "@/lib/shop-mode";

const FALLBACK: Metadata = {
  title: "A seller",
  description: "A seller on Zolace: their items, paid for in shielded ZEC, straight to the seller.",
};

// A link to a seller's page is shown with the seller's own name where it is shared. The picture
// beside it is opengraph-image.tsx. A seller who is not selling gets the plain words.
export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const shop = await storefront(slug).catch(() => null);
  if (!shop) return FALLBACK;

  const title = `${shop.name} on Zolace`;
  const description = `What ${shop.name} sells on Zolace. No account: you pay the seller directly, in shielded ZEC, and the item opens in your browser.`;
  return {
    title,
    description,
    openGraph: { siteName: "Zolace", type: "website", title, description, url: `/s/${shop.slug}` },
  };
}

// A seller is read from the database, so the page is not known before the request. It waits for
// them instead of showing a frame first, and a seller who is not there, or not selling, gets the
// not-found page: it does not say which.
export const instant = false;

const HOW_MANY = ["Nothing", "One item", "Two items", "Three items", "Four items", "Five items"];

export default async function SellerPage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  await connection();

  let shop: Storefront | null;
  try {
    shop = await storefront(slug);
  } catch {
    return (
      <PageShell>
        <p className="cut rounded-3xl bg-card p-6 leading-relaxed text-muted-foreground">
          The shop cannot reach its database right now, so this seller cannot be shown. The rest of
          the site is unaffected.
        </p>
      </PageShell>
    );
  }
  if (!shop) notFound();

  const count = shop.items.length;
  return (
    <PageShell>
      <PageHead
        figure="matrix"
        label="A seller on Zolace"
        title={shop.name}
        facts={[
          count < HOW_MANY.length ? `${HOW_MANY[count]} on the shelf` : `${count} items on the shelf`,
          "Paid straight to the seller",
          "No account",
        ]}
      >
        Everything {shop.name} sells here. {shop.name} is another seller, not Zolace: your payment goes straight
        to the seller&apos;s wallet, in shielded ZEC, and the shop never holds it. So a refund is the seller&apos;s to
        send, and Zolace has not checked these items.
      </PageHead>

      {count === 0 ? (
        <p className="cut rounded-3xl bg-card p-6 leading-relaxed text-muted-foreground">
          Nothing of this seller&apos;s is on the shelf right now.
        </p>
      ) : (
        <ItemCards items={shop.items} order={shopWords().order} naming={false} />
      )}

      <div className="mt-2.5 flex flex-col gap-5 cut rounded-3xl bg-card p-6 md:flex-row md:items-center md:justify-between">
        <p className="max-w-xl leading-relaxed text-muted-foreground">
          An order of one of these gets a link that is the receipt, and the item opens in your browser once the
          payment is three blocks deep. If it does not work, report it on the order&apos;s page: it goes to the
          seller and to the shop.
        </p>
        <div className="flex flex-wrap gap-2">
          <PillLink href="/shop" variant="secondary" arrow>
            The whole shop
          </PillLink>
          <PillLink href="/docs/refunds" variant="outline">
            Refunds
          </PillLink>
        </div>
      </div>
    </PageShell>
  );
}
