import type { Metadata } from "next";

import { OrderView } from "@/components/shop/order-view";
import { PageShell } from "@/components/site/page-shell";

// An order page is private to whoever holds its link: keep it out of search engines and do not
// pass its address on to other sites.
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// The order's id is read before anything is sent; the page itself is filled in by the browser,
// which is the only place the secret half of the link exists.
export const instant = false;

export default async function OrderPage({ params }: PageProps<"/o/[id]">) {
  const { id } = await params;
  return (
    <PageShell>
      <OrderView id={id} />
    </PageShell>
  );
}
