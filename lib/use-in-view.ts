import { useEffect, useState, type RefObject } from "react"

// True while the element is on screen. The small animations use it to rest when nobody can see
// them.
export function useInView(ref: RefObject<Element | null>, threshold = 0.3) {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, threshold])

  return inView
}
