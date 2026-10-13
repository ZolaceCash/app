// An item, as a file the buyer keeps.
//
// The shop deletes a finished order 7 days after it is done, and the order's link then opens
// nothing. Whoever has the item open can save it first: the browser writes it into a plain text
// file on their own device. Nothing is sent anywhere for it.
//
// This file is the part with no browser in it: what the saved file is called and what it says.
// It holds the item and how to use it. It leaves out the order's name, its secret and the price:
// the file may be handed on with a gift, and a file that is found should give away no more than
// the item it is.

// An eSIM's activation code is one line, LPA:1$<where the profile is fetched>$<its code>. A phone
// that is given it by hand often asks for the two parts apart. Null when the line is not of that
// shape, and the whole line is then all there is to show.
export function esimParts(text: string) {
  const [head, address, code] = text.trim().split("$")
  return head === "LPA:1" && address && code ? { address, code } : null
}

export type ItemFile = { name: string; body: string }

// The file's name, from the item's: letters and digits, with a hyphen where anything else stood.
function fileName(product: string) {
  const plain = product
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "")
  return `zolace-${plain || "item"}.txt`
}

// The file for an item that was opened in this browser. `savedAt` is when it is saved: the file
// says the day, in UTC, so that it reads the same wherever it was made.
export function itemFile(product: string, text: string, savedAt: number): ItemFile {
  const item = text.trim()
  const esim = esimParts(item)
  const lines = [`Zolace: ${product.trim() || "an item"}`, `Saved on ${new Date(savedAt).toISOString().slice(0, 10)} (UTC)`, "", "THE ITEM", item, ""]
  if (esim) {
    lines.push(
      "AN ESIM, IN TWO PARTS",
      `SM-DP+ address: ${esim.address}`,
      `Activation code: ${esim.code}`,
      "A phone that asks for the two apart takes these. One that asks for a single code takes",
      "the whole line above, starting with LPA. Install it once: it works on one phone.",
      ""
    )
  }
  lines.push(
    "ABOUT THIS FILE",
    "Your browser made this file from the item your order opened. It was not sent to the shop",
    "or to anyone else.",
    "It is not sealed: whoever can read this file has the item. Keep it where you keep other",
    "things that are worth money.",
    "The shop deletes a finished order from its server 7 days after it is done. This file",
    "does not depend on the order still being there.",
    ""
  )
  return { name: fileName(product), body: lines.join("\n") }
}
