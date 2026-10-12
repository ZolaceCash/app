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
          { shop: true },
          {
            open: "These pages describe how the shop works and how it is planned to work. Details can still change.",
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
      {
        id: "keeping-it-on-your-device",
        heading: "Keeping it on your device",
        blocks: [
          {
            p: "The order's page can have your browser keep the link, if you ask it to. Nothing is kept until you press the button, and what is kept stays in that browser: it is never sent to the shop, and the shop cannot give it back.",
          },
          {
            p: "The kept links are listed on the page Orders on this device. That page reads the browser's own storage and does not ask the server about any order, so the server cannot tell that several orders share a buyer.",
          },
          {
            list: [
              "Anyone who uses that browser can open what it keeps. Do not keep an order on a shared device.",
              "Clearing the browser's data clears the list, so save the link somewhere else too if you still need the order.",
            ],
          },
        ],
      },
      {
        id: "sending-it-as-a-gift",
        heading: "Sending it as a gift",
        blocks: [
          {
            p: "Whoever has the whole link can open the order, so an order can be given away by sending its link. The order's page also gives a gift's link: the same order on a page made for the person who receives it, with the item and how to use it, and without the price or the payment.",
          },
          {
            list: [
              "The person who receives it makes no account and pays nothing. The item opens in their browser.",
              "A gift's link is the same order and the same secret. Someone who rewrites it into the order's own link sees the price there.",
              "There is no way to take a link back after sending it. Whoever has it can open the item, and so can you.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "getting-zec",
    title: "Getting ZEC",
    summary: "What you need before you can pay, and the ways to get shielded ZEC.",
    group: "Buying",
    sections: [
      {
        id: "what-you-need",
        heading: "What you need",
        blocks: [
          {
            p: "Zolace is paid in shielded ZEC and in nothing else. You need a Zcash wallet that can send a shielded payment, with enough ZEC in it for the price and the network's fee, which is small.",
          },
          {
            p: "The wallet is yours. The shop never holds your coins and never learns which wallet paid.",
          },
          {
            list: [
              "Wallets that send shielded payments include Zodl (called Zashi until 2026), YWallet, Zingo, Cake Wallet and Edge. Zolace is not affiliated with any of them.",
              "An exchange account is not such a wallet. What an exchange sends usually leaves from a transparent address, in the open.",
            ],
          },
        ],
      },
      {
        id: "ways-to-get-it",
        heading: "Ways to get it",
        blocks: [
          {
            rows: [
              ["Swap in a wallet", "Some wallets turn another coin into shielded ZEC. In Zodl you pick the coin you have (BTC or USDC, among others), send it from the wallet that holds it, and the ZEC arrives shielded"],
              ["Buy on an exchange", "Buy ZEC and withdraw it to your own wallet. If it arrives at a transparent address, shield it in the wallet before you pay"],
              ["Be sent some", "Anyone who has ZEC can send it to your wallet's shielded address"],
            ],
          },
          {
            p: "Whichever way you take, do it before you start an order. The price of an order is held for 15 minutes, and getting ZEC can take longer than that. An order that runs out costs nothing: start a new one when the ZEC is in your wallet.",
          },
        ],
      },
      {
        id: "what-others-see",
        heading: "What others see on the way",
        blocks: [
          {
            list: [
              "A swap service sees the coin you paid with, the address it came from and the amount. It does not see what you buy afterwards.",
              "An exchange knows who you are and what you withdrew, and a withdrawal to a transparent address can be read by anyone on the Zcash chain.",
              "The payment to the shop, sent from your shielded balance, is written to the chain without showing who sent it, who received it or how much it was.",
            ],
          },
          {
            open: "Wallets change what they offer. Check the wallet's own pages before you rely on a step named here. Paying the shop in another coin directly is not possible.",
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
            p: "Before you order, an item's page says about what its price is in ZEC at the moment, and the rate it used. That figure moves with the rate and is rounded; the exact amount is the one your order shows. Your browser asks the shop for the rate, never an exchange, and the request says nothing about which item you are reading.",
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
            p: "A payment that arrives after the 15 minutes does not buy the item, and it is not lost. It shows up on the order page and is owed back to you: the order's address is watched for as long as the order is kept. Refunds has how it is sent back.",
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
        id: "being-told",
        heading: "Being told when it moves",
        blocks: [
          {
            p: "The shop has no email and no number to reach you on. If you ask it to, your own browser tells you instead: the order's page, left open in a tab, shows a notice when the order moves, for instance when an item that is bought to order is ready.",
          },
          {
            list: [
              "It works while that tab stays open, on that device. Close the tab and nothing tells you; the link still shows where the order stands.",
              "A phone may put a tab in the background to sleep. The notice then comes when you are back on it.",
              "Nothing is sent to the shop for it, and the shop keeps nothing for it.",
              "The notice is shown by your device, so it names no item and no amount.",
            ],
          },
        ],
      },
      {
        id: "other-paths",
        heading: "Other paths",
        blocks: [
          {
            rows: [
              ["Expired", "No payment was seen in the 15 minutes. The item goes back on the shelf"],
              ["Underpaid", "Part of the amount arrived. Send the rest while the 15 minutes run and the order goes on. If they run out first, nothing is handed over and what arrived is owed back"],
              ["Paid late", "The payment arrived after the 15 minutes. Nothing is handed over and all of it is owed back"],
              ["Overpaid", "The item is handed over and the excess is owed back. An excess of 0.0001 ZEC or less is not: the network fee would use it up"],
              ["Nothing left", "Paid in full and in time, and there was no item left to hand over. All of it is owed back"],
              ["Not handed over", "An item that is bought to order was paid for and not handed over in the time its page gives. All of it is owed back"],
            ],
          },
          {
            p: "What is owed back is shown on the order page, with a place to give the address it should be sent to. Refunds has the rest.",
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
        id: "saving-the-item",
        heading: "Saving the item",
        blocks: [
          {
            p: "The order's link works only while the server still has the order, and a finished order is deleted some days after it is done. The link then opens nothing: not for you, and not for someone you sent it to as a gift. So the page with the open item has a button that saves it as a file, and it says from which day the server may delete the order.",
          },
          {
            list: [
              "The file is written by your browser, on your device. Nothing is sent to the shop for it.",
              "It holds the item and how to use it. It leaves out the price, the order and the link.",
              "It is plain text and not sealed: whoever can read the file has the item. Keep it as you would keep the item itself.",
            ],
          },
        ],
      },
      {
        id: "two-kinds-of-goods",
        heading: "Three kinds of goods",
        blocks: [
          {
            rows: [
              ["From stock", "A code uploaded beforehand: vouchers, licences, gift cards"],
              ["Made on demand", "Made by a supplier when the order is paid: AI credit keys, eSIM"],
              ["Bought to order", "Bought by the owner, by hand, once the order is paid. Nothing is bought before the payment is confirmed. The item's page says within how many hours it is handed over"],
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
            p: "Money that is owed back needs no asking. The order page says what is owed and asks for a shielded address to send it to.",
          },
          {
            p: "If the item you were handed does not work, say so on the order page. Under the item there is a place to write what is wrong and to give an address. It needs no email and no account: the order's link is how the report is found.",
          },
          {
            list: [
              "The owner reads each report by hand and answers on the same page.",
              "The answer is a refund, sent by hand, or the reason there is none.",
              "What you write is kept with the order, readable by the owner. Write nothing in it that you want kept from the shop.",
            ],
          },
          { open: "No time is promised for an answer, and a report does not by itself mean a refund." },
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
            p: "That list is for buying. The token lives on a public chain: holding it, and claiming its reward from the vault, can be read by anyone there. It has nothing to do with an order, and the shop asks a holder for nothing.",
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
              "When something waits for the owner (a paid order, a report, a refund), the server may send the owner's phone a line through a notification service. The line says that something waits. It names no order, no item and no amount.",
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
    summary: "On Robinhood Chain. Its holders earn by the hour, in NVDA, claimed from a contract.",
    group: "Under the hood",
    sections: [
      {
        id: "the-plan",
        heading: "In short",
        blocks: [
          {
            rows: [
              ["Chain", "Robinhood Chain"],
              ["Made through", "Pons, a launchpad on that chain. The token's contract is the launchpad's, not this project's"],
              ["Supply", "1,000,000,000 tokens, minted once. A holder can burn their own, so the supply can only shrink"],
              ["Transfer fee", "None"],
              ["Holder reward", "NVDA, Robinhood's stock token for NVIDIA, counted by the hour"],
              ["An hour pays", "At most 0.01 USD for every 3,000,000 tokens held"],
              ["Minimum to earn", "3,000,000 tokens in the wallet, through the whole hour"],
              ["How it is paid", "Claimed by the wallet from the vault's contract, whenever it likes while the reward runs"],
              ["Paid from", "The fee the launchpad pays the token's creator on trades"],
              ["Checks", "No audit and no legal review has been done"],
            ],
          },
          { p: "The token pays for nothing in the shop, and buying in the shop needs no token." },
        ],
      },
      {
        id: "holder-payout",
        heading: "A reward for holders",
        blocks: [
          { p: "The reward comes from the fee the launchpad pays the token's creator on each trade. That fee arrives in ETH. The owner turns it into NVDA, Robinhood's stock token for NVIDIA on Robinhood Chain, and puts it into the vault: a contract that holds the reward until wallets claim it." },
          {
            list: [
              "A wallet has to hold at least 3,000,000 tokens. A wallet under that earns nothing.",
              "What counts is the lowest balance the wallet had in the hour. One that dipped under 3,000,000 at any moment is out for that hour, and one that arrived during the hour starts with the next.",
              "An hour pays at most 0.01 USD, in NVDA, for every 3,000,000 tokens held through it: 6,000,000 earns twice that, 9,000,000 three times. What is over a whole multiple earns nothing. There is nothing to register.",
              "0.01 USD is a ceiling. The vault's contract carries it as a rate in NVDA, which the owner sets from NVDA's price, so it drifts as that price moves.",
              "An hour pays the full rate only while the vault holds enough for all the tokens that count. When it does not, what is left is shared evenly, and after that hours pay nothing until the owner puts more in.",
              "After each hour the site works out the list from the token's transfers: every wallet, with all it has earned so far. The server signs that list, and the contract pays a claim only against a signed list.",
              "A wallet claims what it has earned and not yet taken, on the vault page or straight from the contract, whenever it likes while the reward runs. A claim costs the network's fee, whatever its size.",
              "The server sends nothing to the chain. It holds one key for this: the key that signs the list, which holds no funds. The owner puts the reward in from the owner's wallet, and a holder claims from theirs.",
            ],
          },
          { open: "No hour is promised and no amount is owed: the reward is what the creator fee brought in, up to the ceiling. Whether a share of the shop's orders is added to it is not decided. The vault, page and contract, is built. It is open once its contract is deployed, and the box under Today says whether it is." },
        ],
      },
      {
        id: "public",
        heading: "What is public",
        blocks: [
          { p: "All of the token's side is on a public chain. Who holds the token, every transfer, the whole list of what each wallet has earned and every claim, with its wallet, its amount and its time, can be read by anyone and stays there. The vault page lays the same out: every time the reward was put into the vault and every time the vault paid it out, each with its transaction. The reward is not private, and it borrows nothing from the privacy of a shielded payment." },
          {
            list: [
              "Buying in the shop needs no token and no wallet on that chain, and leaves nothing on it.",
              "A holder tells the shop nothing. The vault page looks a wallet up in the public list inside the browser, and a claim goes from the wallet to the chain.",
              "Anyone can check the list: it can be worked out again from the token's transfers, the vault's rate and what was put into the vault, all of which the chain shows.",
              "The owner can close the reward at any time and without notice. From then on no hour earns, and everything in the vault that has not been claimed, whether a wallet had earned it or not, goes back to the owner as a line on the same list. What a wallet has earned and not claimed by then is lost to it.",
              "What the contract enforces is narrow: a signed list, nothing paid twice, and never more for all wallets together than the rate allows for the whole supply. Whoever held the server's signing key, or the owner's key, could sign another list within that limit, so what is in the vault is not a holder's until it is claimed.",
              "NVDA is Robinhood's token, not this project's. Robinhood describes it as a tokenised debt security, not a share, and restricts where it may be offered. Whether a holder may be handed it has had no legal review.",
            ],
          },
        ],
      },
      {
        id: "today",
        heading: "Today",
        blocks: [
          { token: true },
          {
            p: "The token's address is shown on the home page, with a copy button, and in the box above. Where there is no token, they say so. An address shown anywhere else is not this project's.",
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
