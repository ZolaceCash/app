"use client"

import Link from "next/link"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DocLink = { slug: string; title: string; group: string }

// The outline both forms of this nav share: the top-left and bottom-right corners cut off. It is
// spelled as a class so the shape travels with the component.
const CUT =
  "[--cut:1rem] [clip-path:polygon(var(--cut)_0,100%_0,100%_calc(100%-var(--cut)),calc(100%-var(--cut))_100%,0_100%,0_var(--cut))]"

const pad = (n: number) => String(n).padStart(2, "0")

// The way around the docs. On a narrow screen it is one bar: where you are, back and forward, and
// a list that opens on demand, so the page starts with the doc and not with a menu. On a wide
// screen it is the full numbered list in a column beside the doc.
// Give it `key={current}` where it is used, so the list closes when the page changes.
export function DocsNav({ docs, current }: { docs: DocLink[]; current: string }) {
  const [open, setOpen] = useState(false)
  const at = docs.findIndex((doc) => doc.slug === current)
  const previous = docs[at - 1]
  const next = docs[at + 1]
  const groups = [...new Set(docs.map((doc) => doc.group))]

  const row = (doc: DocLink, compact: boolean) => {
    const on = doc.slug === current
    return (
      <Link
        href={`/docs/${doc.slug}`}
        aria-current={on ? "page" : undefined}
        className={cn(
          "group/doc flex items-baseline gap-3 rounded-lg px-3 transition-colors duration-200",
          compact ? "py-2" : "py-1.5",
          on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span
          className={cn(
            "label-mono shrink-0 text-[0.625rem] transition-colors",
            on ? "text-brand" : "group-hover/doc:text-brand"
          )}
        >
          {pad(docs.indexOf(doc) + 1)}
        </span>
        <span className={cn("truncate text-sm", on && "font-medium")}>{doc.title}</span>
      </Link>
    )
  }

  const step = (doc: DocLink | undefined, label: string, Icon: typeof ChevronLeft) =>
    doc ? (
      <Link
        href={`/docs/${doc.slug}`}
        className={buttonVariants({ variant: "outline", size: "icon-sm" })}
      >
        <Icon aria-hidden />
        <span className="sr-only">
          {label}: {doc.title}
        </span>
      </Link>
    ) : (
      <span
        aria-hidden
        className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), "opacity-30")}
      >
        <Icon />
      </span>
    )

  return (
    <nav aria-label="Docs" className="lg:sticky lg:top-24">
      {/* Narrow: one bar. */}
      <div className={cn(CUT, "bg-card lg:hidden")}>
        <div className="flex h-14 items-center gap-3 pr-3 pl-5">
          <span className="label-mono shrink-0 text-brand">
            {pad(at + 1)} <span className="text-muted-foreground">/ {pad(docs.length)}</span>
          </span>
          <span className="truncate font-medium tracking-[-0.02em]">{docs[at]?.title}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {step(previous, "Previous", ChevronLeft)}
            {step(next, "Next", ChevronRight)}
            <button
              type="button"
              aria-expanded={open}
              aria-controls="docs-list"
              onClick={() => setOpen((value) => !value)}
              className={buttonVariants({ variant: open ? "inverse" : "secondary", size: "sm" })}
            >
              All
              <ChevronDown
                aria-hidden
                className={cn("transition-transform duration-300", open && "rotate-180")}
              />
            </button>
          </div>
        </div>

        {/* Opens by growing its grid row, so the height eases instead of jumping. */}
        <div
          id="docs-list"
          className={cn(
            "grid transition-[grid-template-rows] duration-500 ease-out",
            open ? "grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <ol className="grid grid-cols-2 gap-x-1 gap-y-0.5 px-2 pt-1 pb-5">
              {docs.map((doc) => (
                <li key={doc.slug}>{row(doc, true)}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Wide: the whole list, grouped. */}
      <div className={cn(CUT, "hidden bg-card p-3 pb-6 lg:block")}>
        <Link
          href="/docs"
          className="label-mono flex items-center justify-between rounded-lg px-3 py-2.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          All docs
          <span>{pad(docs.length)}</span>
        </Link>
        {groups.map((group) => (
          <div key={group} className="mt-3">
            <p className="label-mono px-3 pb-1.5 text-[0.625rem] text-muted-foreground">{group}</p>
            <ol className="space-y-0.5">
              {docs
                .filter((doc) => doc.group === group)
                .map((doc) => (
                  <li key={doc.slug}>{row(doc, false)}</li>
                ))}
            </ol>
          </div>
        ))}
      </div>
    </nav>
  )
}
