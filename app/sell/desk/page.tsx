import type { Metadata } from "next";

import { SellerDesk } from "@/components/sell/desk";
import { PageShell } from "@/components/site/page-shell";

// A seller's desk is private to whoever holds its link: keep it out of search engines and do not
// pass its address on to other sites.
export const metadata: Metadata = {
  title: "Your desk",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// The page itself is the same for everyone: the desk is filled in by the browser, which is the
// only place the secret of the link is read from the address.
export default function SellDesk() {
  return (
    <PageShell>
      <SellerDesk />
    </PageShell>
  );
}
