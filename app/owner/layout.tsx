import type { Metadata } from "next";

// The owner's screens are not for the public: keep them out of search engines, and do not pass
// their address on to other sites.
export const metadata: Metadata = {
  title: { default: "Owner", template: "%s · Owner · Zolace" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function OwnerLayout({ children }: LayoutProps<"/owner">) {
  return children;
}
