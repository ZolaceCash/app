import { connection } from "next/server"
import { Suspense } from "react"

import { CopyButton } from "@/components/site/copy-button"
import { chainName, explorerUrl, tokenConfig, tokenStatement, type TokenConfig } from "@/lib/token"
import { cn } from "@/lib/utils"

// Whether there is a token today, said the same way on every page that speaks of it. It is read
// when the page is asked for, not when the site is built: setting TOKEN_ADDRESS where the server
// runs, and restarting, is all it takes to change every one of these at once.
//
// `tone` is the surface it lies on: the accent box of the long pages, or the deep indigo of the
// token's own blocks.

type Tone = "box" | "navy"

function View({ config, tone }: { config: TokenConfig; tone: Tone }) {
  const explorer = config.address ? explorerUrl(config.chainId, config.address) : null
  const navy = tone === "navy"

  return (
    <div className={navy ? "leading-relaxed" : "rounded-xl bg-accent p-5 leading-relaxed text-accent-foreground"}>
      {navy ? null : <span className="label-mono mb-2 block">Today</span>}
      <p className={navy ? "text-pretty text-white/70" : "text-foreground/85"}>{tokenStatement(config)}</p>
      {config.address ? (
        <div className={cn("mt-4 rounded-lg px-4 py-3", navy ? "bg-white/[0.07]" : "bg-background/60")}>
          <p className={cn("label-mono", navy ? "text-white/60" : "text-muted-foreground")}>
            Contract address, {chainName(config.chainId)}
          </p>
          <p className={cn("mt-1.5 font-mono text-xs break-all", navy ? "text-white" : "text-foreground")}>
            {config.address}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <CopyButton text={config.address} variant="outline" size="xs">
              Copy
            </CopyButton>
            {explorer ? (
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer noopener"
                className={cn(
                  "label-mono underline-offset-4 hover:underline",
                  navy ? "text-white/70" : "text-muted-foreground"
                )}
              >
                See it on the explorer
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

async function Current({ tone }: { tone: Tone }) {
  await connection()
  return <View config={tokenConfig()} tone={tone} />
}

export function TokenStatus({ tone = "box" }: { tone?: Tone }) {
  return (
    // Nothing is said until the answer is there: a page must not say "no token" for a moment, or to
    // a reader without scripts, when there is one.
    <Suspense fallback={<div aria-busy className={tone === "navy" ? "h-24" : "h-28 rounded-xl bg-accent"} />}>
      <Current tone={tone} />
    </Suspense>
  )
}

// One line of a table of facts: the address, or that there is none.
async function CurrentShort() {
  await connection()
  const { address } = tokenConfig()
  return address ? <span title={address}>{`${address.slice(0, 8)}…${address.slice(-6)}`}</span> : <>Not available yet</>
}

export function TokenAddressShort() {
  return (
    <Suspense fallback="…">
      <CurrentShort />
    </Suspense>
  )
}
