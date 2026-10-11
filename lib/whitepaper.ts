import type { Section } from "@/lib/content"

// The whitepaper: the design in one document, written from PLAN.md. It is a draft of intent, so
// it names what is undecided and unchecked instead of smoothing it over. It must never promise
// total privacy, claim an audit or a legal review, call the token private, or read as an offer of
// a token.
export const WHITEPAPER = {
  version: "Draft 0.5",
  date: "11 October 2026",
  abstract:
    "Zolace is a shop for digital goods that asks for no account. A buyer picks an item priced in dollars, pays in shielded Zcash to an address made for that one order, and opens the item in the browser. The server holds a viewing key and nothing that can move funds. A token is planned for after the shop, on Robinhood Chain, and its holders are paid in shielded ZEC. This paper describes the design, what the server can and cannot learn, the order in which it will be built, and what is still open.",
}

export const WHITEPAPER_SECTIONS: Section[] = [
  {
    id: "problem",
    heading: "The problem",
    blocks: [
      {
        p: "Buying a digital item usually costs more than its price. It costs an account, an email address, a card number and a record that links all three to what was bought.",
      },
      {
        p: "Most of that is not needed to hand over a code. A shop needs to know that it was paid and where to show the item. Zolace is built around those two facts and tries to collect nothing else.",
      },
    ],
  },
  {
    id: "design",
    heading: "Design in three choices",
    blocks: [
      {
        rows: [
          ["No account", "An order is its own link. There is nothing to sign up for or log in to."],
          ["One address per order", "Each order is paid to a shielded Zcash address that is used once."],
          ["Viewing key only", "The server can see payments arrive. It holds no key that can spend."],
        ],
      },
      {
        p: "The seed of the wallet stays with the owner, offline. If the server were taken over, the attacker could read incoming payments and could not move them.",
      },
    ],
  },
  {
    id: "order",
    heading: "The life of an order",
    blocks: [
      {
        rows: [
          ["Waiting", "The item is reserved, the address is shown, the price is held"],
          ["Seen", "The payment has reached the network"],
          ["Confirmed", "Three blocks have passed, about four minutes"],
          ["Delivered", "The item is handed over on the order page"],
        ],
      },
      {
        p: "An order can also leave this path: it can expire, be underpaid, be overpaid, or be owed a refund. Each of those needs a written rule and a test before real money is accepted.",
      },
      {
        p: "Refunds are made by hand. A shielded payment does not name its sender, so the buyer gives an address and the owner sends the refund from their own wallet, less the network fee.",
      },
      { open: "The rules for the side paths are not written yet. They belong to stage 2 of the roadmap." },
    ],
  },
  {
    id: "delivery",
    heading: "Handing over the item",
    blocks: [
      {
        p: "The order link is /o/<id>#<secret>. The part after # is never sent to a server by a browser, so the server knows which order is being opened without ever holding the secret.",
      },
      {
        p: "The buyer's browser makes a key, and the item is encrypted to it. After delivery the server keeps ciphertext only, and deletes the order some days after it is done.",
      },
      {
        rows: [
          ["From stock", "The owner uploads codes; one is handed over per order"],
          ["Made on demand", "A supplier makes the item when the order is paid"],
        ],
      },
      { p: "The shop starts with goods from stock, which need no integration. Suppliers are added one at a time." },
    ],
  },
  {
    id: "price",
    heading: "Price",
    blocks: [
      {
        p: "Items are priced in dollars and paid in ZEC. The rate comes from two sources. If they differ by more than 2%, no price is quoted. A quoted price is held for 15 minutes.",
      },
      {
        p: "ZEC can still move between the moment the price is held and the moment the payment is confirmed. Inside the 15 minutes that movement is the shop's to carry, not the buyer's.",
      },
    ],
  },
  {
    id: "knowledge",
    heading: "What the server knows",
    blocks: [
      { p: "Privacy here means a short list of things collected, said out loud. It does not mean invisibility." },
      {
        rows: [
          ["Never learned", "Name, email, the paying address or wallet, the secret half of the link, the item after delivery"],
          ["Known", "What was ordered and when, the amount, the IP address of each page load, a refund address if one is given"],
        ],
      },
      {
        list: [
          "No third-party analytics.",
          "No IP addresses in the app's own logs. The host it runs on, and the network in front of it, may keep access logs.",
          "A network in front of the server (Cloudflare, in the planned setup) sees each request before the server does. It never sees the part of a link after #.",
          "Orders deleted some days after they are done.",
        ],
      },
      { p: "A shielded payment is written to the Zcash chain without showing its sender, its receiver or its amount. That holds for a payment sent from a shielded balance; one sent from a transparent address shows that address and the amount." },
      { open: "None of this has been audited." },
    ],
  },
  {
    id: "architecture",
    heading: "Architecture",
    blocks: [
      {
        rows: [
          ["App", "Next.js with a SQLite database"],
          ["Payment engine", "Self-hosted, behind one small interface: make an address, read its status"],
          ["Keys", "A viewing key on the server; the seed offline with the owner"],
          ["Price", "Two sources, 2% tolerance, 15 minute hold"],
        ],
      },
      {
        p: "The payment engine sits behind an interface so that it can be replaced. Two self-hosted engines were compared. One does not handle the current shielded pool. The other was run on testnet with a viewing key and nothing else: it gave each invoice an address of its own, and saw and confirmed a shielded payment once it was patched for the testnet's newest upgrade. It is not wired into the shop: today a stand-in takes its place.",
      },
      {
        open: "Before real payments, three things about that engine have to be settled: it reads the chain through a block explorer run by others, which then learns which transactions pay this shop; it takes its price from one source where this design asks for two; and it confirms after one block where this design says three. An engine that falls behind a network upgrade misses payments without an error, so the shop also needs an alarm of its own for that.",
      },
    ],
  },
  {
    id: "token",
    heading: "The token",
    blocks: [
      {
        p: "A token is planned for after the shop, on Robinhood Chain. Orders are not paid on that chain, and neither is the payout to holders: both are shielded ZEC. What the public chain carries is the token itself.",
      },
      {
        rows: [
          ["Supply", "1,000,000,000 tokens, minted once. No function mints more"],
          ["Transfer fee", "The token takes a fee each time it is transferred: 1% at most, and it can be lowered, never raised. The fee goes to the payout"],
          ["Share of orders", "A share of each order in the shop is set aside for the payout"],
          ["Holder payout", "Sent to holders in shielded ZEC, by the owner, once a month"],
          ["Minimum", "A wallet has to hold at least 3,000,000 tokens to be paid, which is 0.3% of the supply"],
          ["Counting", "A wallet counts with the lowest balance it had in the month, and the payout is split by that balance among the wallets that qualify and have registered"],
        ],
      },
      {
        p: "A holder registers a shielded Zcash address and proves the wallet is theirs by signing a message with it. A signature is not a transaction, so registering puts nothing on a chain. The server stores the wallet with its shielded address, and nothing else about the holder.",
      },
      {
        p: "The contract is small on purpose. Its owner can lower the fee, change where the fee goes and name addresses that pay none. Nobody can mint, stop transfers, block a wallet or move another wallet's tokens, because no such function exists.",
      },
      {
        p: "The owner sends the payout from their own wallet. The server holds a viewing key and nothing that can move funds, so it cannot send one. The shop's share is in ZEC already; the transfer fee is taken on Robinhood Chain and exchanged for ZEC by the owner, by hand.",
      },
      {
        p: "A contract that holders claim from was considered and set aside. A contract cannot pay ZEC, and a claim on a public chain would show who was paid and how much. The price of the choice is that no contract enforces the payout, and that nobody outside, holders included, can check from a chain what was paid.",
      },
      {
        p: "The token itself is not private. Who holds it, every transfer and the fee taken are public on Robinhood Chain, so anyone can work out which wallets qualify in a month. Buying in the shop needs no token and no wallet on that chain.",
      },
      {
        open: "There is no token today and no contract address. A contract has been written and tested; it has not been audited and has not been deployed. It will not launch before an audit and a legal review, and neither has been done. The numbers above can still change before deployment. The share of an order that goes to the payout, and who receives the supply at the start, are not decided. Nothing in this paper is an offer.",
      },
    ],
  },
  {
    id: "risks",
    heading: "Risks",
    blocks: [
      {
        rows: [
          ["Law", "Rules on paying with crypto assets, on privacy coins, on selling vouchers or gift cards without identity checks, and on tokens that pay holders a share of fees or of a shop's takings differ by country and can forbid parts of this"],
          ["Chain", "The token depends on one chain that one company launched. Its sequencer leaves out transactions tied to sanctioned addresses. Which countries are shut out has not been checked"],
          ["Token", "A token that takes a fee on every transfer does not work everywhere a plain token does. Where it does on this chain has not been checked"],
          ["Payout", "The payout is sent by the owner by hand. No contract enforces it, and a shielded payout cannot be checked from outside"],
          ["Suppliers", "Many suppliers forbid resale. Each item's terms have to be read before it is listed"],
          ["Price", "ZEC can move while a price is held"],
          ["Engine", "The payment engine has seen one test payment and is not wired into the shop. Behind a network upgrade it misses payments without an error"],
        ],
      },
      { open: "No legal review has been done. This paper is a description of a design, not advice of any kind." },
    ],
  },
  {
    id: "status",
    heading: "Status and open questions",
    blocks: [
      {
        p: "Today the site takes test orders: the order flow, the sealing of the item and the order page work, against a pretend payment and with made-up items. No real payment is accepted and nothing real is sold.",
      },
      {
        list: [
          "How the payment engine reads the chain without telling a third party which transactions are ours, and how the shop notices an engine that has stopped seeing payments.",
          "The written rules for expired, underpaid, overpaid and refunded orders.",
          "How many days a finished order is kept.",
          "The support channel for refunds, which will need no email.",
          "The first goods on the shelf.",
          "The share of an order that goes to the payout, and who receives the token's supply at the start.",
        ],
      },
      { p: "The roadmap lists the stages in order. A stage ends when its test passes, not on a date." },
    ],
  },
]
