import type { Section } from "@/lib/content"

// The docs. They describe how the shop is planned to work (PLAN.md): only test orders run, so
// every page is written in the future tense where it matters and marks what is not final.
// Nothing here may promise total privacy or claim an audit or a legal review. The token is the
// public side of the plan: no page may call it private, and none may read as an offer.
export type Doc = {
  slug: string
  title: string
  summary: string
  group: "Buying" | "Under the hood"
  sections: Section[]
}

export const DOCS: Doc[] = [
  {
    slug: "overview",
    title: "Overview",
    summary: "What Zolace is, what it is not, and where it stands today.",
    group: "Buying",
    sections: [
      {
        id: "what-it-is",
        heading: "What it is",
        blocks: [
          {
            p: "Zolace is a shop for digital goods that needs no account. Prices are in dollars, you pay in shielded Zcash (ZEC) from your own wallet, and the item opens in your browser.",
          },
          {
            list: [
              "No account and no email at checkout.",
              "One shielded address per order, used once.",
              "The server holds a viewing key only: it can see a payment arrive and cannot move a coin.",
            ],
          },
        ],
      },
      {
        id: "what-it-is-not",
        heading: "What it is not",
        blocks: [
          {
            p: "It is not invisible. Shielded ZEC hides who paid; it does not hide that an order was placed. The server knows what was ordered, the amount, and the IP address a page was loaded from.",
          },
          { p: "It is not a wallet and not an exchange. It never holds your funds." },
        ],
      },
      {
        id: "status",
        heading: "Where it stands",
        blocks: [
          {
            open: "This is a preview. You can place a test order: it uses the live ZEC price, a pretend payment and a made-up item. No real payment is accepted and nothing real is sold. These pages describe how the shop is planned to work, and details can change before it opens.",
          },
          { open: "No audit and no legal review have been done." },
        ],
      },
    ],
  },
  {
    slug: "placing-an-order",
    title: "Placing an order",
    summary: "Checkout without an account, and why the order link is the receipt.",
    group: "Buying",
    sections: [
      {
        id: "checkout",
        heading: "Checkout",
        blocks: [
          {
            p: "Pick an item and check out. Checkout asks nothing about you: no name, no email, no password.",
          },
          {
            p: "The item is set aside for you at that moment and stays set aside until the order is paid or expires.",
          },
        ],
      },
      {
        id: "the-order-link",
        heading: "The order link",
        blocks: [
          {
            p: "Each order gets its own link, and that link is the receipt. The page behind it is where you pay, follow the status and take the item.",
          },
          {
            p: "The link has two halves. The first names the order. The second, after the # sign, is a secret that your browser keeps to itself: browsers never send that part to a server.",
          },
          {
            list: [
              "Keep the link. There is no account to recover it from.",
              "Whoever has the whole link can open the order.",
              "Without the secret half, the item cannot be opened.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "paying-in-zec",
    title: "Paying in ZEC",
    summary: "The one-time address, the price lock and what your wallet needs.",
    group: "Buying",
    sections: [
      {
        id: "the-address",
        heading: "The address",
        blocks: [
          {
            p: "The order page shows a shielded Zcash address and a QR code. The address is made for that one order and is not used again.",
          },
          {
            p: "You pay from your own Zcash wallet. It has to be a wallet that can send a shielded payment.",
          },
        ],
      },
      {
        id: "the-price",
        heading: "The price",
        blocks: [
          {
            p: "Prices are set in dollars. At checkout the price is turned into ZEC and held for 15 minutes.",
          },
          {
            rows: [
              ["Price held for", "15 minutes"],
              ["Price sources", "Two, compared with each other"],
              ["Largest gap allowed", "2%"],
              ["Paid in", "Shielded ZEC"],
            ],
          },
          {
            p: "If the two sources differ by more than 2%, no price is quoted and the order cannot be started until they agree again.",
          },
        ],
      },
      {
        id: "after-the-lock",
        heading: "After the lock",
        blocks: [
          {
            p: "When the 15 minutes run out without a payment, the order expires and the item goes back on the shelf.",
          },
          {
            open: "What happens to a payment that arrives after an order has expired is not written down yet. It will be, here, before checkout opens.",
          },
        ],
      },
    ],
  },
  {
    slug: "order-states",
    title: "Order states",
    summary: "From waiting to delivered, and the cases that go another way.",
    group: "Buying",
    sections: [
      {
        id: "the-usual-path",
        heading: "The usual path",
        blocks: [
          {
            rows: [
              ["Waiting", "The address is shown and the price is held"],
              ["Seen", "The network has seen your payment"],
              ["Confirmed", "Three blocks have passed, about four minutes"],
              ["Delivered", "The item is handed over on the order page"],
            ],
          },
          { p: "You do not have to keep the page open. Come back with the link and it shows where the order stands." },
        ],
      },
      {
        id: "other-paths",
        heading: "Other paths",
        blocks: [
          {
            list: [
              "Expired: the lock ran out before a payment was seen.",
              "Underpaid: less arrived than the order asked for.",
              "Overpaid: more arrived than the order asked for.",
              "Refund due: the order cannot be completed and the payment has to go back.",
            ],
          },
          {
            open: "The exact rule for each of these is written together with the tests for it (roadmap, stage 2). The rules will be published here before checkout opens.",
          },
        ],
      },
    ],
  },
  {
    slug: "delivery",
    title: "Delivery",
    summary: "How the item reaches you, and what the server keeps afterwards.",
    group: "Buying",
    sections: [
      {
        id: "opening-the-item",
        heading: "Opening the item",
        blocks: [
          {
            p: "The item appears on the order page once the payment is confirmed: a code, a key or a link, depending on what you bought.",
          },
          {
            p: "It is encrypted to a key that your browser made and that never leaves it. The item is decrypted in your browser, on your device.",
          },
        ],
      },
      {
        id: "what-is-kept",
        heading: "What is kept",
        blocks: [
          {
            p: "After delivery the server keeps a sealed copy only: ciphertext it cannot read. The order is deleted some days after it is done.",
          },
          { open: "The number of days is not fixed yet." },
        ],
      },
      {
        id: "two-kinds-of-goods",
        heading: "Two kinds of goods",
        blocks: [
          {
            rows: [
              ["From stock", "A code uploaded beforehand: vouchers, licences, gift cards"],
              ["Made on demand", "Made by a supplier when the order is paid: AI credit keys, eSIM"],
            ],
          },
          { p: "The shop opens with goods from stock. Goods made on demand are added later, one at a time." },
        ],
      },
    ],
  },
  {
    slug: "refunds",
    title: "Refunds",
    summary: "Refunds are made by hand. Here is what that means.",
    group: "Buying",
    sections: [
      {
        id: "how-a-refund-works",
        heading: "How a refund works",
        blocks: [
          {
            p: "A shielded payment does not say where it came from, so a refund cannot simply be sent back. You give an address, and the refund is sent to it by hand from the owner's wallet.",
          },
          {
            list: [
              "You give a Zcash address to refund to.",
              "The network fee is taken from the refund.",
              "The refund address becomes known to the server. Nothing else about you does.",
            ],
          },
        ],
      },
      {
        id: "asking-for-one",
        heading: "Asking for one",
        blocks: [
          {
            open: "The support channel is not set up yet. It will be one that needs no email, and it will be named here before checkout opens.",
          },
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy",
    summary: "What the server never learns, what it does know, and what shielded covers.",
    group: "Under the hood",
    sections: [
      {
        id: "never-learned",
        heading: "Never learned",
        blocks: [
          {
            list: [
              "Your name or your email. Checkout does not ask.",
              "The address or the wallet you paid from.",
              "The secret half of your order link.",
              "The item, once it is delivered: only a sealed copy stays.",
            ],
          },
        ],
      },
      {
        id: "shielded",
        heading: "What shielded covers",
        blocks: [
          {
            p: "A shielded payment is written to the Zcash chain without showing who sent it, who received it or how much it was. Nothing on the chain names the shop, the order or the item.",
          },
          {
            p: "That holds for a payment sent from a shielded balance. One sent from a transparent address, as some exchanges send, shows that address and the amount on the chain.",
          },
        ],
      },
      {
        id: "known",
        heading: "Known to the server",
        blocks: [
          {
            list: [
              "What you ordered, and when.",
              "The amount, in dollars and in ZEC.",
              "Your IP address, each time a page loads.",
              "A refund address, if you ask for a refund.",
            ],
          },
          {
            p: "Shielded ZEC hides who paid. It does not hide that an order was placed. If the IP address matters to you, that part is yours to handle: the shop cannot do it for you.",
          },
          {
            p: "That list is for buying. The token is planned for later, and a holder who registers for its payout will tell the server one more thing: which shielded address belongs to which wallet.",
          },
        ],
      },
      {
        id: "around-every-order",
        heading: "Around every order",
        blocks: [
          {
            list: [
              "No third-party analytics or trackers on any page.",
              "The app does not write IP addresses to its logs. The host it runs on, and the network in front of it, may keep access logs of their own.",
              "A network in front of the server (Cloudflare, in the planned setup) sees each request before the server does: your address and which pages you open. It never sees the part of a link after #.",
              "Orders are deleted some days after they are done.",
            ],
          },
          {
            open: "No audit has been done. Read this as a description of how the shop is built, not as a guarantee.",
          },
        ],
      },
    ],
  },
  {
    slug: "the-token",
    title: "The token",
    summary: "After the shop, on Robinhood Chain. Its holders are paid in shielded ZEC.",
    group: "Under the hood",
    sections: [
      {
        id: "the-plan",
        heading: "The plan",
        blocks: [
          {
            rows: [
              ["Chain", "Robinhood Chain"],
              ["Supply", "1,000,000,000 tokens, minted once"],
              ["Transfer fee", "1% at most. It can be lowered, never raised"],
              ["Holder payout", "Sent in shielded ZEC, once a month"],
              ["Minimum to be paid", "3,000,000 tokens in the wallet"],
              ["Paid from", "A fee on each transfer of the token, and a share of each order in the shop"],
              ["Before launch", "An audit and a legal review"],
              ["Status", "Not live. A contract is written, not audited, not deployed"],
            ],
          },
          { p: "The shop comes first. A token only makes sense once there is a shop whose orders have something to share." },
        ],
      },
      {
        id: "holder-payout",
        heading: "A payout for holders",
        blocks: [
          { p: "The payout has two sources. The token takes a fee each time it is transferred, and a share of each order in the shop is set aside. It is paid out in shielded ZEC, the same way an order is paid." },
          {
            list: [
              "A wallet has to hold at least 3,000,000 tokens, which is 0.3% of the supply. A wallet under that gets no share.",
              "What counts is the lowest balance the wallet had in the month. One that dipped under 3,000,000 at any time is out for that month.",
              "The month's payout is split by that lowest balance, among the wallets that qualify and have registered.",
              "The holder gives a shielded Zcash address and proves the wallet is theirs by signing a message with it. Signing is not a transaction: it costs nothing and puts nothing on a chain.",
              "Each month the owner sends every registered wallet its share, from the owner's own wallet. The server holds no key that can send ZEC or tokens.",
              "The shop's share is in ZEC already. The transfer fee is taken on Robinhood Chain, so the owner exchanges it for ZEC by hand.",
            ],
          },
          { open: "These numbers are the plan's and can still change before the token is deployed. The share of an order that goes to the payout is not decided, and neither is who receives the supply at the start. The page where a wallet registers is not built." },
        ],
      },
      {
        id: "public",
        heading: "What is public, and what is not",
        blocks: [
          { p: "The token is on a public chain, so who holds it and every transfer, with the fee taken, can be read by anyone. Which wallets qualify in a month can be worked out by anyone from that. The payout is not on that chain. It is a shielded payment, which shows no sender, no receiver and no amount." },
          {
            list: [
              "Buying in the shop needs no token and no wallet on that chain, and leaves nothing on it.",
              "To be paid, a holder tells the shop one thing: which shielded address belongs to which wallet. The server stores that pair and asks for nothing else.",
              "Nobody outside can check how much was paid out or to whom, and that includes holders. No contract enforces the payout: it rests on the owner sending it.",
            ],
          },
        ],
      },
      {
        id: "today",
        heading: "Today",
        blocks: [
          {
            open: "There is no token and no contract address. Anything offered under this name today is not from this project.",
          },
          {
            p: "A contract has been written and tested. It has not been audited and has not been deployed anywhere, so there is nothing to buy, hold or claim.",
          },
          {
            p: "When a contract exists, its address will be shown on the home page with a copy button. Until then that slot reads \"Not available yet\".",
          },
        ],
      },
    ],
  },
]

export const DOC_GROUPS: Doc["group"][] = ["Buying", "Under the hood"]

export function findDoc(slug: string) {
  return DOCS.find((doc) => doc.slug === slug)
}
