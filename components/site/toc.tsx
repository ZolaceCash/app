"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

export type TocItem = { id: string; title: string }

// The list of sections beside a long page. The section being read is marked: a bar slides to it
// and its title brightens as the page scrolls.
export function Toc({
  items,
  label,
  numbered = false,
}: {
  items: TocItem[]
  label: string
  numbered?: boolean
}) {
  const [current, setCurrent] = useState(items[0]?.id)

  useEffect(() => {
    // A section counts as "being read" while its top is in the upper part of the window.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(entry.target.id)
        }
      },
      { rootMargin: "-15% 0px -70% 0px" }
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  const at = Math.max(
    0,
    items.findIndex((item) => item.id === current)
  )

  return (
    <nav aria-label={label}>
      <p className="label-mono px-3 text-muted-foreground">{label}</p>
      <ul className="relative mt-3">
        <li
          aria-hidden
          style={{ transform: `translateY(${at * 2.25}rem)` }}
          className="absolute top-0 left-0 h-9 w-0.5 bg-primary transition-transform duration-500 ease-out"
        />
        {items.map((item, index) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={item.id === current ? "location" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 truncate px-3 text-sm transition-colors duration-300",
                item.id === current
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {numbered ? (
                <span className="label-mono shrink-0 text-[0.625rem]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              ) : null}
              <span className="truncate">{item.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
