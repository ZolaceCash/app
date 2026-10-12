"use client"

import { Qr } from "@/components/shop/qr"
import { SaveItem } from "@/components/shop/save-item"
import { CopyButton } from "@/components/site/copy-button"
import { esimParts } from "@/lib/item-file"
import { cn } from "@/lib/utils"

// An item that was opened in this browser, laid out for use: an eSIM as a QR code and as its two
// parts, anything else as the code it is, a button that copies it and one that saves it as a file
// named after `product`. The order's page shows it to the buyer and a gift's page to whoever was
// sent the link. `children` stand beside the buttons. `goneAfter` is when the server may delete
// the order (OrderView.goneAfter): the page then says so, because the link opens nothing after it.
// A day, as the reader's own calendar has it.
const day = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

export function ItemView({
  text,
  product,
  goneAfter = null,
  children,
}: {
  text: string
  product: string
  goneAfter?: number | null
  children?: React.ReactNode
}) {
  const esim = esimParts(text)

  return (
    <>
      {text.startsWith("LPA:") ? (
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <Qr text={text} label="The eSIM's activation code, as a QR code" />
          <p className="max-w-[18rem] text-sm leading-snug text-muted-foreground">
            An eSIM. On the phone that will use it, open the mobile data settings, choose to add an
            eSIM and scan this code. Reading this on that phone? It cannot scan its own screen:
            enter the details by hand, from the parts below. Install it once: it works on one
            phone.
          </p>
        </div>
      ) : null}
      {esim ? (
        <dl className="mt-4 space-y-1.5">
          {(
            [
              ["SM-DP+ address", esim.address],
              ["Activation code", esim.code],
            ] as const
          ).map(([name, value]) => (
            <div key={name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-secondary px-5 py-4">
              <div className="min-w-0">
                <dt className="label-mono text-muted-foreground">{name}</dt>
                <dd className="mt-1.5 font-mono text-sm break-all">{value}</dd>
              </div>
              <CopyButton text={value} variant="outline" size="xs">
                Copy
              </CopyButton>
            </div>
          ))}
          <p className="pt-1.5 text-sm leading-snug text-muted-foreground">
            A phone that asks for the two apart takes these. One that asks for a single code takes
            the whole line below, starting with LPA.
          </p>
        </dl>
      ) : null}
      <p
        className={cn(
          "mt-4 rounded-xl bg-secondary px-5 py-6 text-center font-mono break-all",
          text.length > 40 ? "text-sm" : "text-xl tracking-[0.08em] md:text-2xl"
        )}
      >
        {text}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <CopyButton text={text} size="lg">
          Copy the item
        </CopyButton>
        <SaveItem product={product} text={text} variant="outline" size="lg" />
        {children}
      </div>
      <p className="mt-4 rounded-xl bg-secondary p-5 text-sm leading-snug text-muted-foreground">
        <span className="label-mono mb-2 block text-foreground">Keep the item, not only the link</span>
        {goneAfter === null ? "The shop deletes a finished order from its server some days after it is done" : `The shop's server may delete this order from ${day(goneAfter)}`}
        , and this link then opens nothing. Save the item before that: the file is written by your
        browser, on this device, and is sent nowhere. It is not sealed, so whoever can read it has
        the item.
      </p>
    </>
  )
}
