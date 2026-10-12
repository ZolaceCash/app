import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"

import { signOut } from "@/app/owner/actions"
import { PageShell } from "@/components/site/page-shell"
import { DotLabel } from "@/components/site/primitives"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SCREENS = [
  { href: "/owner", name: "Orders" },
  { href: "/owner/refunds", name: "Refunds" },
  { href: "/owner/products", name: "Items" },
  { href: "/owner/sellers", name: "Sellers" },
  { href: "/owner/payout", name: "Payout" },
] as const

// What every owner's screen shares: the site's frame, which screen this is, the way to the others,
// and the way out. `due` is the number of refunds waiting, shown on its tab so it cannot be missed;
// `toBuy` is the number of paid orders whose item the owner still has to buy, shown on the orders tab.
export function OwnerFrame({
  at,
  title,
  due,
  toBuy = 0,
  children,
}: {
  at: (typeof SCREENS)[number]["href"]
  title: string
  due: number
  toBuy?: number
  children: ReactNode
}) {
  return (
    <PageShell>
      <div className="enter flex flex-col gap-6 px-3 pb-8 md:px-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <DotLabel>Owner</DotLabel>
          <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-5xl">
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <nav aria-label="Owner's screens" className="flex flex-wrap gap-1.5">
            {SCREENS.map((screen) => (
              <Button key={screen.href} asChild variant={screen.href === at ? "default" : "secondary"} size="sm">
                <Link href={screen.href} aria-current={screen.href === at ? "page" : undefined}>
                  {screen.name}
                  {screen.href === "/owner" && toBuy > 0 ? (
                    <span className="rounded bg-foreground/15 px-1.5 py-0.5">{toBuy}</span>
                  ) : null}
                  {screen.href === "/owner/refunds" && due > 0 ? (
                    <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-destructive">{due}</span>
                  ) : null}
                </Link>
              </Button>
            ))}
          </nav>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
      {children}
    </PageShell>
  )
}

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("cut rounded-3xl bg-card p-6 md:p-8", className)} {...props} />
}

export function Field({
  label,
  hint,
  className,
  ...props
}: { label: string; hint?: string } & ComponentProps<"input">) {
  return (
    <label className={cn("block", className)}>
      <span className="label-mono text-muted-foreground">{label}</span>
      <input
        className="mt-2 h-11 w-full rounded-lg bg-secondary px-4 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"
        {...props}
      />
      {hint ? <span className="mt-2 block text-sm leading-snug text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

// A moment as the owner reads it: the date and the time in UTC, to the minute.
export const when = (ms: number | null) => (ms ? `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC` : "")
