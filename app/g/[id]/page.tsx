import type { Metadata } from "next";

import { GiftView } from "@/components/shop/gift-view";
import { PageShell } from "@/components/site/page-shell";

// A gift's page is private to whoever holds its link, like the order's page it is another view
// of: keep it out of search engines and do not pass its address on to other sites.
export const metadata: Metadata = {
  title: "A gift for you",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// The order's id is read before anything is sent; the page itself is filled in by the browser,
// which is the only place the secret half of the link exists.
export const instant = false;

export default async function GiftPage({ params }: PageProps<"/g/[id]">) {
  const { id } = await params;
  return (
    <PageShell>
      <GiftView id={id} />
    </PageShell>
  );
}
