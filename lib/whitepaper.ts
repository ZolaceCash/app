import type { Section } from "@/lib/content"

// The whitepaper: the design in one document, written from PLAN.md. It is a draft of intent, so
// it names what is undecided and unchecked instead of smoothing it over. It must never promise
// total privacy, claim an audit or a legal review, call the token private, or read as an offer of
// a token.
export const WHITEPAPER = {
  version: "Draft 0.6",
  date: "11 October 2026",
  abstract:
    "Zolace is a shop for digital goods that asks for no account. A buyer picks an item priced in dollars, pays in shielded Zcash to an address made for that one order, and opens the item in the browser. The server holds a viewing key and nothing that can move funds. A token is planned for after the shop, on Robinhood Chain, and its holders are rewarded in NVDA, a stock token on that chain, claimed from a contract. This paper describes the design, what the server can and cannot learn, the order in which it will be built, and what is still open.",
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
        p: "A token is planned for after the shop, on Robinhood Chain. Orders are not paid on that chain: they are shielded ZEC. The token, the reward to its holders and the contract that pays it are all on the public chain.",
      },
      {
        rows: [
          ["Supply", "1,000,000,000 tokens, minted once. No function mints more"],
          ["Transfer fee", "The token takes a fee each time it is transferred: 1% at most, and it can be lowered, never raised. The fee goes to the reward"],
          ["Share of orders", "A share of each order in the shop is set aside for the reward"],
          ["Holder reward", "NVDA, Robinhood's stock token for NVIDIA on the same chain, put into a contract by the owner once a month"],
          ["Minimum", "A wallet has to hold at least 3,000,000 tokens to be on a month's list, which is 0.3% of the supply"],
          ["Counting", "A wallet counts with the lowest balance it had in the month, and the reward is split by that balance among the wallets that qualify"],
          ["Claiming", "A wallet on the list takes its part from the contract itself. Nothing is sent to it"],
        ],
      },
      {
        p: "The contract that pays is the vault. Once a month is over, the owner works out the list of wallets and their parts from the token's transfers and funds the month: the reward goes into the contract together with one hash that stands for the list. A wallet proves its line against that hash and the contract pays it. A month is funded once. The owner cannot change it or take it back, and a part nobody claims stays there.",
      },
      {
        p: "Both contracts are small on purpose. The token's owner can lower the fee, change where the fee goes and name addresses that pay none. Nobody can mint, stop transfers, block a wallet or move another wallet's tokens, because no such function exists. The vault's owner can fund a month and do nothing else to it.",
      },
      {
        p: "The owner funds the vault from their own wallet. The server holds a viewing key for the shop and no key for this chain, so it can neither fund a month nor claim from one. The transfer fee is taken in the token and the shop's share is in ZEC; the owner exchanges both for NVDA by hand, and how much goes into a month is the owner's decision.",
      },
      {
        p: "An earlier draft paid holders in shielded ZEC, by hand, so that a payout would show nobody. This draft replaces that with a reward on the token's own chain. What it gains: a contract holds the reward, and anyone can check what went in and what was claimed. What it costs: every claim shows its wallet and its amount and stays on the chain, and the list is still worked out by the owner, off the chain.",
      },
      {
        p: "Nothing on the token's side is private. Who holds it, every transfer, the fee taken, each month's list and each claim are public on Robinhood Chain. Buying in the shop needs no token and no wallet on that chain.",
      },
      {
        p: "NVDA is not this project's token. Robinhood issues it and describes it as a tokenised debt security, not a share, and it restricts where the token may be offered. Nothing here is endorsed by Robinhood or by NVIDIA, and whether a holder may be handed NVDA where they live has not been reviewed.",
      },
      {
        open: "There is no token today and no contract address. Two contracts have been written and tested, the token and the vault; neither has been audited or deployed. They will not launch before an audit and a legal review, and neither has been done. The numbers above can still change before deployment. How much goes into a month, the share of an order that goes to the reward, and who receives the supply at the start are not decided. Nothing in this paper is an offer.",
      },
    ],
  },
  {
    id: "risks",
    heading: "Risks",
    blocks: [
      {
        rows: [
          ["Law", "Rules on paying with crypto assets, on privacy coins, on selling vouchers or gift cards without identity checks, on tokens that pay holders from fees or from a shop's takings, and on handing people a tokenised security differ by country and can forbid parts of this"],
          ["Chain", "The token depends on one chain that one company launched. Its sequencer leaves out transactions tied to sanctioned addresses. Which countries are shut out has not been checked"],
          ["Token", "A token that takes a fee on every transfer does not work everywhere a plain token does. Where it does on this chain has not been checked"],
          ["Reward", "The contract pays what a month's list says, but the owner works out the list and chooses the amount. The vault's contract has not been audited. NVDA is another company's token, with that company's rules and a price that moves"],
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
          "How much goes into a month, the share of an order that goes to the reward, and who receives the token's supply at the start.",
        ],
      },
      { p: "The roadmap lists the stages in order. A stage ends when its test passes, not on a date." },
    ],
  },
]
