"use client"

import { BellRing } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { longWait, noticeFor, settled, tellKey } from "@/lib/notice"

// On the order page: lets the buyer have this tab tell them when the order moves (lib/notice.ts).
// It is the browser's own notice, shown by the device. The shop is not asked for anything and
// keeps nothing for it: there is still no email and no number.

const CHANGED = "zolace:tell"
const MARK = "● "
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange)
  return () => window.removeEventListener(CHANGED, onChange)
}
// "unsupported" when this browser has no notices at all (some phones' browsers have none).
const permission = () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission)

function asked(id: string) {
  try {
    return window.sessionStorage.getItem(tellKey(id)) === "1"
  } catch {
    return false
  }
}
function setAsked(id: string, on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(tellKey(id), "1")
    else window.sessionStorage.removeItem(tellKey(id))
  } catch {}
  window.dispatchEvent(new Event(CHANGED))
}

// `stage` is the order's stage (stageOf in lib/notice.ts).
export function TellMe({ id, stage }: { id: string; stage: string }) {
  const wanted = useSyncExternalStore(subscribe, () => asked(id), () => false)
  const allowed = useSyncExternalStore(subscribe, permission, () => "default")
  const [refused, setRefused] = useState(false)
  const on = wanted && allowed === "granted"

  // The stage the order was at when this tab last looked. A change, while the buyer has asked,
  // is told once; the first look is not a change.
  const last = useRef<string | null>(null)
  // The tab's title as the page set it, and the wait before it is put back.
  const plain = useRef("")
  const putBack = useRef<number | undefined>(undefined)
  useEffect(() => {
    const notice = noticeFor(last.current, stage)
    last.current = stage
    if (!notice || !on) return
    if (!document.title.startsWith(MARK)) plain.current = document.title
    try {
      const shown = new Notification(`Zolace: ${notice.title}`, { body: notice.body, tag: `zolace-${id.slice(0, 8)}` })
      shown.onclick = () => window.focus()
    } catch {
      // A browser that allows notices and still will not show one from a page: the tab's title has to do.
    }
    // The tab's own title says it too, until the buyer is back on the page.
    document.title = `${MARK}${notice.title}`
    const back = () => {
      if (document.visibilityState !== "visible") return
      document.title = plain.current
      document.removeEventListener("visibilitychange", back)
    }
    window.clearTimeout(putBack.current)
    if (document.visibilityState === "visible") putBack.current = window.setTimeout(back, 6000)
    else document.addEventListener("visibilitychange", back)
  }, [stage, on, id])

  async function ask() {
    setRefused(false)
    const answer = allowed === "granted" ? "granted" : await Notification.requestPermission().catch(() => "denied")
    if (answer === "granted") setAsked(id, true)
    else setRefused(true)
    window.dispatchEvent(new Event(CHANGED))
  }

  // Nothing to be told about any more, or a browser with no notices: the panel is not shown.
  if (allowed === "unsupported" || (settled(stage) && !on)) return null

  return (
    <div className="cut rounded-3xl bg-card p-5 md:p-6">
      <p className="label-mono flex items-center gap-2 text-muted-foreground">
        <BellRing aria-hidden className="size-3.5" />
        {on ? "This tab will tell you" : "Be told when it moves"}
      </p>
      <p className="mt-3 text-sm leading-snug text-muted-foreground">
        {on
          ? settled(stage)
            ? "It told you when the order was done. Nothing was sent to the shop for it."
            : "Keep this tab open, in the background if you like. Your browser shows a notice when the order moves. Nothing is sent to the shop for it."
          : longWait(stage)
            ? "This item is being prepared for your order, which can take hours. Your browser can show a notice when it is ready, while this tab stays open. No email, no number, and nothing is sent to the shop for it."
            : "Your browser can show a notice when the order moves, while this tab stays open. No email, no number, and nothing is sent to the shop for it."}
      </p>
      {settled(stage) ? null : (
        <div className="mt-4">
          {on ? (
            <Button variant="outline" onClick={() => setAsked(id, false)}>
              Stop telling me
            </Button>
          ) : (
            <Button variant="outline" onClick={ask}>
              Tell me in this browser
            </Button>
          )}
        </div>
      )}
      {refused || (wanted && allowed === "denied") ? (
        <p role="alert" className="mt-3 text-sm leading-snug text-destructive">
          This browser is set not to show notices from this site. Allow them in its settings for this site, or keep
          an eye on the page.
        </p>
      ) : null}
    </div>
  )
}
