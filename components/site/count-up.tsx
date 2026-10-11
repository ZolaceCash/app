"use client"

import { useEffect, useRef, useState } from "react"

import { useInView } from "@/lib/use-in-view"

// A figure that counts up to its value the first time it is seen. The server renders the final
// value, so without scripts the number is simply there.
export function CountUp({ to, duration = 900 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, 0.6)
  const [value, setValue] = useState(to)
  const frame = useRef(0)
  const started = useRef(false)

  useEffect(() => {
    if (!inView || started.current) return
    started.current = true
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round((1 - Math.pow(1 - t, 3)) * to))
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    // Not cancelled when it scrolls away: once started, the count runs to its end.
  }, [inView, to, duration])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return (
    <span ref={ref} className="tabular-nums">
      {value}
    </span>
  )
}
