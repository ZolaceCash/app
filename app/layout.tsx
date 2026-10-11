import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { X_HANDLE } from "@/components/site/x-link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Where the site lives. Links in a page's metadata are made whole from this.
  metadataBase: new URL("https://zolace.cash"),
  title: {
    default: "Zolace: digital goods, no account, paid in shielded Zcash",
    template: "%s · Zolace",
  },
  description:
    "A shop for digital goods that needs no account. Prices are in dollars, payment is in shielded ZEC, and the item opens in your browser.",
  // How a link to the site is shown where it is shared: with the picture from opengraph-image.tsx.
  openGraph: { siteName: "Zolace", type: "website" },
  twitter: { card: "summary_large_image", site: `@${X_HANDLE}` },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Without scripts nothing is revealed on scroll, so show everything. */}
        <noscript>
          <style>{`.reveal{opacity:1;transform:none}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
