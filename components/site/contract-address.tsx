"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { ChainIcon } from "@/components/site/chain-icons"
import { Button } from "@/components/ui/button"

// The token's contract address with a copy button. Until the token exists the slot is there but
// says so, and the button cannot be pressed. The address comes from the server (token-address.tsx),
// which is told it where it runs.
export function ContractAddress({ address: TOKEN_ADDRESS }: { address: string | null }) {
  const [copied, setCopied] = useState(false)
  const reset = useRef(0)

  useEffect(() => () => window.clearTimeout(reset.current), [])

  async function copy() {
    if (!TOKEN_ADDRESS) return
    await navigator.clipboard.writeText(TOKEN_ADDRESS)
    setCopied(true)
    window.clearTimeout(reset.current)
    reset.current = window.setTimeout(() => setCopied(false), 1800)
  }

  const short = TOKEN_ADDRESS ? `${TOKEN_ADDRESS.slice(0, 6)}…${TOKEN_ADDRESS.slice(-4)}` : null

  return (
    <div className="flex max-w-full items-center gap-2.5 rounded-lg bg-secondary py-1.5 pr-1.5 pl-3">
      <ChainIcon className="size-4 shrink-0 text-brand" />
      <span className="label-mono text-muted-foreground">CA</span>
      {short ? (
        <span className="truncate font-mono text-xs" title={TOKEN_ADDRESS ?? undefined}>
          {short}
        </span>
      ) : (
        <span className="truncate font-mono text-xs text-muted-foreground">Not available yet</span>
      )}
      <Button
        variant="outline"
        size="xs"
        onClick={copy}
        disabled={!TOKEN_ADDRESS}
        title={TOKEN_ADDRESS ? undefined : "The token is not live, so there is no address to copy"}
        className="ml-1"
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  )
}
