"use client"

import { useState } from "react"
import { decodeFunctionResult, encodeFunctionData } from "viem"

import { Button } from "@/components/ui/button"
import { call, connect, mined, onNetwork, provider, send } from "@/components/vault/wallet"
import { REWARD_ABI, VAULT_ABI } from "@/lib/vault"
import { cn } from "@/lib/utils"

// Where the owner funds a month, from the owner's own wallet in this browser. Two transactions:
// one lets the vault take the reward, the other hands over the month's root and the amount. The
// server sends neither and holds no key that could.
export function FundPanel({
  chainId,
  vault,
  reward,
  symbol,
  id,
  root,
  total,
}: {
  chainId: number
  vault: `0x${string}`
  reward: `0x${string}`
  symbol: string
  id: number
  root: `0x${string}`
  // Smallest units, as text: too large for a plain number.
  total: string
}) {
  const [step, setStep] = useState<"idle" | "allowing" | "funding" | "done">("idle")
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null)

  async function fund() {
    const eth = provider()
    if (!eth) {
      setNote({ text: "No wallet was found in this browser.", bad: true })
      return
    }
    const amount = BigInt(total)
    setNote(null)
    try {
      await onNetwork(eth, chainId)
      const owner = await connect(eth)
      if (!owner) throw new Error("no account")

      const held = decodeFunctionResult({
        abi: REWARD_ABI,
        functionName: "balanceOf",
        data: await call(eth, reward, encodeFunctionData({ abi: REWARD_ABI, functionName: "balanceOf", args: [owner] })),
      })
      if (held < amount) {
        setNote({ text: `This wallet holds less ${symbol} than the month needs.`, bad: true })
        return
      }

      const allowed = decodeFunctionResult({
        abi: REWARD_ABI,
        functionName: "allowance",
        data: await call(eth, reward, encodeFunctionData({ abi: REWARD_ABI, functionName: "allowance", args: [owner, vault] })),
      })
      if (allowed < amount) {
        setStep("allowing")
        const hash = await send(eth, owner, reward, encodeFunctionData({ abi: REWARD_ABI, functionName: "approve", args: [vault, amount] }))
        if (!(await mined(eth, hash))) throw new Error("approve failed")
      }

      setStep("funding")
      const hash = await send(eth, owner, vault, encodeFunctionData({ abi: VAULT_ABI, functionName: "fund", args: [id, root, amount] }))
      if (!(await mined(eth, hash))) throw new Error("fund failed")
      setStep("done")
      setNote({ text: "Funded. Record the month below, so the vault page lists it.", bad: false })
    } catch {
      setStep("idle")
      setNote({
        text: "The month was not funded. Only the vault's owner can fund it, and a month can be funded once.",
        bad: true,
      })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button type="button" disabled={step !== "idle"} onClick={fund}>
        {step === "allowing"
          ? "Letting the vault take it"
          : step === "funding"
            ? "Funding the month"
            : step === "done"
              ? "Funded"
              : "Fund from my wallet"}
      </Button>
      <p aria-live="polite" className={cn("text-sm leading-snug", note?.bad ? "text-destructive" : "text-muted-foreground")}>
        {note?.text}
      </p>
    </div>
  )
}
