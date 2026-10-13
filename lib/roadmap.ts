// The public roadmap. It is PLAN.md's "Stages" in the reader's words, without the time estimates:
// a stage ends when its test passes, not on a date. Keep the two in step.
export type Stage = {
  // "P" for the preview, then 0 to 5 as in PLAN.md.
  code: string
  title: string
  // "now": the stage whose turn it is. "building": started ahead of its turn, and not finished.
  status: "done" | "now" | "building" | "planned" | "gated"
  work: string[]
  doneWhen: string
}

export const STATUS_LABEL: Record<Stage["status"], string> = {
  done: "Done",
  now: "Now",
  building: "Building",
  planned: "Planned",
  gated: "Gated",
}

export const STAGES: Stage[] = [
  {
    code: "P",
    title: "The preview",
    status: "done",
    work: [
      "This site: what the shop is and how an order will run",
      "The shelves, the roadmap, the docs and the whitepaper",
      "Online, with test orders that anyone can place",
    ],
    doneWhen: "The site says plainly what exists and what does not.",
  },
  {
    code: "0",
    title: "Try the payment engines",
    status: "done",
    work: [
      "Two self-hosted Zcash payment engines compared; one does not handle the current shielded pool",
      "The other run on testnet with a viewing key and paid to a one-time shielded address",
      "Found on the way: it missed the payment until it was patched for the testnet's newest upgrade",
    ],
    doneWhen:
      "A payment to a one-time shielded address was seen and confirmed on testnet by a server that holds a viewing key only.",
  },
  {
    code: "1",
    title: "The shop's skeleton",
    status: "done",
    work: [
      "The order flow with a stand-in payment, the order page and a page per item",
      "Items sealed to the buyer's browser, and a page listing what is stored",
      "Screens for the owner: orders, the refund queue, items and stock upload",
    ],
    doneWhen:
      "One test order ran from checkout to the item opening in the browser.",
  },
  {
    code: "2",
    title: "Real payments",
    status: "done",
    work: [
      "One paid order on Zcash's test network, then one on the main network: seen, confirmed, handed over at three blocks, the item opened",
      "Every state an order can be in, the refund screen, and a form for the address a refund goes to",
    ],
    doneWhen:
      "The tests for an order paid too little, too much, too late and twice all pass. They run against a played engine; on the chain, an order paid in full has run on both networks.",
  },
  {
    code: "3",
    title: "Open the shop",
    status: "done",
    work: [
      "The first real goods on the shelf, and an item from stock sold for a real payment",
      "The docs give the rules as they run: every way an order can go, refunds, a report for an item that does not work",
      "The shop's terms are written, and a finished order is kept 7 days",
    ],
    doneWhen: "The shop sold an item from the stock of codes, for a real payment.",
  },
  {
    code: "4",
    title: "More goods",
    status: "now",
    work: [
      "Built: items bought to order, by hand, once the order is paid, and a gift's link for handing an order on",
      "Built, and run against a played supplier only: an eSIM a supplier makes when the order is paid",
      "Built, and run with a paid order on the test network: other sellers, paid straight to their own wallets, each with a desk, a page of their own and notices",
      "Not built: AI credit keys, paying from other coins",
    ],
    doneWhen: "Decided per item: each one is added on its own.",
  },
  {
    code: "5",
    title: "The token",
    status: "gated",
    work: [
      "A token on Robinhood Chain, made through a launchpad there",
      "A reward in NVDA, a stock token on the same chain, for wallets holding at least 3,000,000 tokens: at most 0.01 USD an hour for every 3,000,000 held, paid from the creator fee on trades",
      "The vault, a contract holders claim from, with its page and the hourly list the server signs",
    ],
    doneWhen: "The vault runs on the chain, audited, with a legal review done. Neither check has been done.",
  },
]
