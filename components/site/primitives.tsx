import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { Scramble } from "@/components/site/scramble"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Container({ className, ...props }: ComponentProps<"div">) {
  // 78rem on an ordinary screen; on a wide one the page grows to nine tenths of it.
  return <div className={cn("mx-auto w-full max-w-[max(78rem,90%)] px-3 md:px-4", className)} {...props} />
}

// A mono label with the accent dot in front of it.
export function DotLabel({ className, children, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("label-mono inline-flex items-center gap-2.5", className)} {...props}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
      {children}
    </span>
  )
}

// What a label is scrambled with before it settles (it is shown in capitals).
export const LETTERS = "abcdefghijklmnopqrstuvwxyz"

// The head of a section: label and heading on the left, a paragraph (and an action) on the right.
export function SectionHead({
  index,
  label,
  title,
  children,
  action,
  className,
}: {
  // The section's place on the page, shown before the label.
  index?: number
  label: string
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid gap-6 px-3 pb-10 md:px-4 lg:grid-cols-2 lg:items-end lg:gap-16", className)}>
      <div>
        <DotLabel>
          {index ? <span className="text-muted-foreground">0{index} /</span> : null}
          <Scramble text={label} every={0} glyphs={LETTERS} />
        </DotLabel>
        <h2 className="mt-5 max-w-xl text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-5xl">
          {title}
        </h2>
      </div>
      <div className="flex flex-col items-start gap-5 lg:items-end lg:text-right">
        {children ? (
          <p className="max-w-md leading-relaxed text-pretty text-muted-foreground">{children}</p>
        ) : null}
        {action}
      </div>
    </div>
  )
}

// A pill that is a link. `arrow` adds the small arrow every primary action carries.
export function PillLink({
  href,
  children,
  arrow = false,
  ...props
}: { href: string; arrow?: boolean } & Omit<ComponentProps<typeof Button>, "asChild">) {
  return (
    <Button asChild {...props}>
      <Link href={href}>
        {children}
        {arrow ? (
          <ArrowUpRight
            aria-hidden
            className="transition-transform duration-300 ease-out group-hover/button:translate-x-0.5 group-hover/button:-translate-y-0.5"
          />
        ) : null}
      </Link>
    </Button>
  )
}

// The mark: a slanted V cut in two, one colour. app/icon.svg draws the same two shapes.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <polygon points="8.1,2 22,2 13.25,14.5 10.65,14.5 15.9,7 4.6,7" />
      <polygon points="19.4,17 15.9,22 2,22 10.75,9.5 13.35,9.5 8.1,17" />
      <polygon points="5.5,2 7,2 3.5,7 2,7" />
      <polygon points="20.5,17 22,17 18.5,22 17,22" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-6" />
      <span className="text-[1.4375rem] leading-none font-bold tracking-[-0.05em]">zolace</span>
    </span>
  )
}
