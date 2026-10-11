import { engine } from "@/lib/payment"

// What the shop takes right now, and the words each page uses for it. Every page that says what
// kind of order can be placed takes it from here (components/site/shop-status.tsx), so switching
// payments on changes all of them at once and none is left saying "test orders only" beside a
// real address.
//
// preview: the stand-in, no money. testnet: the real engine on Zcash's test network, coins worth
// nothing. open: real ZEC.
export type ShopMode = "preview" | "testnet" | "open"

export function shopMode(): ShopMode {
  const network = engine().network
  return network === "mainnet" ? "open" : network === "testnet" ? "testnet" : "preview"
}

export type ShopWords = {
  // The small label in the site's top bar.
  pill: string
  // One line under the logo in the footer.
  status: string
  // The line on the home page, above the first button.
  badge: string
  // What the button that starts an order says.
  order: string
  // The head of the shop's page.
  title: string
  facts: string[]
  about: string
  // One sentence under the shelf.
  line: string
  // The note beside an item's order button.
  noteLabel: string
  note: string
  // What the long pages (docs, whitepaper, roadmap) say about today.
  today: string
}

export const SHOP_WORDS: Record<ShopMode, ShopWords> = {
  preview: {
    pill: "Preview",
    status: "Preview. Test orders only, no real payments.",
    badge: "Preview: test orders only, no real payments",
    order: "Try a test order",
    title: "Try an order. No money moves.",
    facts: ["Test orders only", "No real payments yet", "No account"],
    about:
      "The shop has no real goods and takes no real payments yet. What works is the order itself: pick a test item, get a link, watch the order run and open a made-up item in your browser.",
    line: "A test order uses the live ZEC price and a pretend payment. Everything else is as the real shop will run it.",
    noteLabel: "Test orders only",
    note: "No real payment is taken yet. An order placed here uses the live ZEC price and a pretend payment, and moves no money.",
    today:
      "This is a preview. You can place a test order: it uses the live ZEC price, a pretend payment and a made-up item. No real payment is accepted and nothing real is sold.",
  },
  testnet: {
    pill: "Test network",
    status: "Test network. Orders are paid in test coins, which are worth nothing.",
    badge: "Test network: orders are paid in test coins, worth nothing",
    order: "Order with test coins",
    title: "Order with test coins.",
    facts: ["Zcash test network", "Coins worth nothing", "No account"],
    about:
      "The shop is running on Zcash's test network. An order here is paid like a real one, to an address made for it, in coins that are worth nothing. The items are made up.",
    line: "An order is paid in test coins from a test wallet of your own. Everything else is as the real shop runs it.",
    noteLabel: "Test network",
    note: "This order is paid in Zcash test coins, which are worth nothing. No real payment is taken.",
    today:
      "The shop is running on Zcash's test network. An order is paid to an address made for it, in test coins that are worth nothing, and the items are made up. No real payment is accepted.",
  },
  open: {
    pill: "Open",
    status: "Open. Orders are paid in shielded ZEC.",
    badge: "Open: orders are paid in shielded ZEC",
    order: "Order",
    title: "Pick an item. Pay shielded.",
    facts: ["Paid in shielded ZEC", "No account", "Not audited"],
    about:
      "Pick an item, get a link, pay the order's own address from your wallet and open the item in your browser. The price is held for 15 minutes.",
    line: "An item is priced in dollars and paid in ZEC, at a rate held for 15 minutes.",
    noteLabel: "Before you pay",
    note: "Send the exact amount to the order's address within 15 minutes. What arrives late, or on top of the price, is owed back to you and is returned by hand, less the network's fee.",
    today:
      "The shop takes orders paid in shielded ZEC. An order is paid to an address made for it and handed over once the payment is three blocks deep. Nothing here has been audited.",
  },
}

export const shopWords = () => SHOP_WORDS[shopMode()]
