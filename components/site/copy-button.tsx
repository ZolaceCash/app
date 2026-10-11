"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"

// A button that copies `text` and says so for a moment.
export function CopyButton({
  text,
  children = "Copy",
  ...props
}: { text: string } & Omit<ComponentProps<typeof Button>, "onClick">) {
  const [copied, setCopied] = useState(false)
  const reset = useRef(0)

  useEffect(() => () => window.clearTimeout(reset.current), [])

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.clearTimeout(reset.current)
    reset.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Button onClick={copy} {...props}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : children}
    </Button>
  )
}
