"use client"

import { Check, Download } from "lucide-react"
import { useEffect, useRef, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { itemFile } from "@/lib/item-file"

// A button that saves the opened item as a text file on this device (lib/item-file.ts). The
// browser writes the file itself: no request is made for it, so the item stays where it was
// opened.
export function SaveItem({
  product,
  text,
  children = "Save as a file",
  ...props
}: { product: string; text: string } & Omit<ComponentProps<typeof Button>, "onClick">) {
  const [saved, setSaved] = useState(false)
  const reset = useRef(0)

  useEffect(() => () => window.clearTimeout(reset.current), [])

  function save() {
    const file = itemFile(product, text, Date.now())
    // A browser may refuse to hand a page a file: then nothing was saved, and the button does not say so.
    try {
      const url = URL.createObjectURL(new Blob([file.body], { type: "text/plain;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url
      link.download = file.name
      link.rel = "noopener"
      document.body.append(link)
      link.click()
      link.remove()
      // The browser has the file's bytes by now; the page lets go of its copy.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      return
    }
    setSaved(true)
    window.clearTimeout(reset.current)
    reset.current = window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <Button onClick={save} {...props}>
      {saved ? <Check aria-hidden /> : <Download aria-hidden />}
      {saved ? "Saved" : children}
    </Button>
  )
}
