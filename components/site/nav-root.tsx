"use client"

import { useEffect, useState, type ReactNode } from "react"

// How far the page must scroll before the nav counts as "scrolled".
const SCROLLED_PX = 48

// The fixed frame of the nav. It has no background of its own, so the page shows through it;
// it only tells its children whether the page has scrolled (`group-data-[scrolled=true]/nav:`),
// and they rearrange themselves: the bare logo fades away and its mark moves into the panel.
export function NavRoot({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > SCROLLED_PX)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return (
    <header
      data-scrolled={scrolled}
      className="group/nav pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      {children}
    </header>
  )
}
