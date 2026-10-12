import type { Metadata } from "next";

import { KeptOrders } from "@/components/shop/kept-orders";
import { PageHead, PageShell } from "@/components/site/page-shell";
import { Reveal } from "@/components/site/reveal";

export const metadata: Metadata = {
  title: "Orders on this device",
  description: "The order links this browser was asked to keep. They are on your device only: the shop does not have them.",
};

const RESTS_ON = [
  "The list is in this browser's own storage. The shop's server does not have it, is not sent it, and cannot give it back.",
  "This page does not ask the server how each order stands. Asking about several orders at once would tell it that they share a buyer. Open one to see where it stands.",
  "Anyone who uses this browser can open what it keeps. Do not keep an order on a device you share.",
  "Clearing the browser's data clears the list, and a private window forgets it when it closes. An order you still need should have its link saved somewhere else too.",
];

// The orders a buyer asked this browser to keep (lib/kept.ts). The page is the same for everyone
// and holds nothing: the list is read in the browser, from the browser.
export default function Orders() {
  return (
    <PageShell>
      <PageHead
        figure="contour"
        label="Orders on this device"
        title="What this browser keeps for you."
        facts={["Kept only when you ask", "Never sent to the shop", "No account"]}
      >
        An order&apos;s link is its receipt, and there is no account to recover it from. On an order&apos;s page you
        can have this browser keep the link. This is where those are.
      </PageHead>

      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <KeptOrders />

        <Reveal className="cut rounded-3xl bg-ice p-6 text-ink md:p-8 lg:sticky lg:top-24">
          <p className="label-mono">What it rests on</p>
          <ul className="mt-6 space-y-4 leading-snug">
            {RESTS_ON.map((line) => (
              <li key={line} className="flex gap-3">
                <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 bg-current opacity-50" />
                {line}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </PageShell>
  );
}
