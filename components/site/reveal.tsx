"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"

// Fades its children up the first time they scroll into view. The motion itself is the `.reveal`
// rule in app/globals.css: with reduced motion it only fades, and without scripts it is off.
export function Reveal({
  children,
  className,
  delay = 0,
  id,
}: {
  children: ReactNode
  className?: string
  delay?: number
  // For a block that a link on the page points at.
  id?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      id={id}
      data-shown={shown}
      className={cn("reveal", className)}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}
