"use client"

import { useEffect, useRef, useState } from "react"

import { useInView } from "@/lib/use-in-view"

const HEX = "abcdef0123456789"
// Characters that are never scrambled, so the shape of the string stays readable.
const FIXED = /[\s…#/•-]/
const RUN_MS = 800
const FRAME_MS = 45

// Text that decodes itself: random glyphs that settle into the real string from left to right,
// again every `every` ms while it is on screen. With `sealed`, the string rests as that mask
// between runs, so it reads as being opened and closed again. With `every={0}` it runs once.
// Only the characters change, nothing moves, so it also runs with reduced motion.
export function Scramble({
  text,
  sealed,
  glyphs = HEX,
  every = 6000,
  delay = 400,
  className,
}: {
  text: string
  sealed?: string
  glyphs?: string
  every?: number
  // How long after it comes into view the first run starts.
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref)
  const [shown, setShown] = useState(sealed ?? text)
  const done = useRef(false)

  useEffect(() => {
    if (!inView || (every <= 0 && done.current)) return
    let frame = 0
    let timer = 0

    const run = () => {
      const start = performance.now()
      let last = 0
      const tick = (now: number) => {
        const settled = Math.floor(((now - start) / RUN_MS) * text.length)
        if (settled >= text.length) {
          setShown(text)
          done.current = true
          if (every > 0) timer = window.setTimeout(sealed ? rest : run, sealed ? every / 2 : every)
          return
        }
        if (now - last >= FRAME_MS) {
          last = now
          setShown(
            [...text]
              .map((char, index) =>
                index < settled || FIXED.test(char)
                  ? char
                  : glyphs[Math.floor(Math.random() * glyphs.length)]
              )
              .join("")
          )
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    const rest = () => {
      if (sealed) setShown(sealed)
      timer = window.setTimeout(run, every / 2)
    }

    timer = window.setTimeout(run, delay)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      if (every <= 0) setShown(text)
    }
  }, [inView, text, sealed, glyphs, every, delay])

  return (
    <span ref={ref} className={className}>
      {shown}
    </span>
  )
}
