"use client"

import QRCode from "qrcode"
import { useEffect, useState } from "react"

// A QR code drawn in this browser from a text the page already has: an eSIM's activation code, or
// where and how much to pay. Nothing is fetched for it and the text goes nowhere: a picture of it
// served by someone else would tell them who is looking at which code.
export function Qr({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0b10", light: "#ffffff" } })
      .then((made) => alive && setSvg(made))
      .catch(() => alive && setSvg(null))
    return () => {
      alive = false
    }
  }, [text])

  if (!svg) return <div aria-busy className="size-44 rounded-xl bg-secondary" />
  return (
    <div
      role="img"
      aria-label={label}
      className="size-44 overflow-hidden rounded-xl bg-white p-2 [&>svg]:size-full"
      // The picture is made here, from the text above, by the library: it is not anyone's input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
