// The public roadmap. It is PLAN.md's "Stages" in the reader's words, without the time estimates:
// a stage ends when its test passes, not on a date. Keep the two in step.
export type Stage = {
  // "P" for the preview, then 0 to 5 as in PLAN.md.
  code: string
  title: string
  // "building": started ahead of its turn, and not finished.
  status: "done" | "next" | "building" | "planned" | "gated"
  work: string[]
  doneWhen: string
}

export const STATUS_LABEL: Record<Stage["status"], string> = {
  done: "Done",
  next: "Next",
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
      "One test order runs from checkout to the item opening in the browser. It does: try it in the shop.",
  },
  {
    code: "2",
    title: "Real payments",
    status: "next",
    work: [
      "Testnet first, then mainnet with small amounts",
      "Every state an order can be in, and the refund screen",
    ],
    doneWhen: "The tests for an order paid too little, too much, too late and twice all pass.",
  },
  {
    code: "3",
    title: "Open the shop",
    status: "planned",
    work: ["Final docs, the privacy page and the terms", "The first real goods on the shelf"],
    doneWhen: "The shop sells items from the stock of codes, for real payments.",
  },
  {
    code: "4",
    title: "More goods",
    status: "planned",
    work: [
      "Goods a supplier makes when the order is paid: AI credit keys, eSIM",
      "Paying from other coins",
      "Gift links",
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
