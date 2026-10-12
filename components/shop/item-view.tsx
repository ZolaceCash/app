"use client"

import { Qr } from "@/components/shop/qr"
import { CopyButton } from "@/components/site/copy-button"
import { cn } from "@/lib/utils"

// An eSIM's activation code is one line, LPA:1$<where the profile is fetched>$<its code>. A phone
// that is given it by hand often asks for the two parts apart. Null when the line is not of that
// shape, and the whole line is then all there is to show.
export function esimParts(text: string) {
  const [head, address, code] = text.trim().split("$")
  return head === "LPA:1" && address && code ? { address, code } : null
}

// An item that was opened in this browser, laid out for use: an eSIM as a QR code and as its two
// parts, anything else as the code it is, and a button that copies it. The order's page shows it
// to the buyer and a gift's page to whoever was sent the link. `children` stand beside the button.
export function ItemView({ text, children }: { text: string; children?: React.ReactNode }) {
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
        {children}
      </div>
    </>
  )
}
