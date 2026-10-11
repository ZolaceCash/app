"use client"

import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react"
import { Fragment, useRef, useState, type ComponentType, type CSSProperties, type PointerEvent } from "react"

import { ZecIcon } from "@/components/site/chain-icons"
import {
  KeyIcon,
  NoAccountIcon,
  PriceLockIcon,
  SealIcon,
  ShelfIcon,
  TokenIcon,
} from "@/components/site/icons"
import { LETTERS } from "@/components/site/primitives"
import { Scramble } from "@/components/site/scramble"
import { ShaderFill, type Figure } from "@/components/site/shader-fill"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Card = {
  tag: string
  // The shader graphic behind the card (site/shader-fill.tsx): which figure, on which fill, in which
  // colour. `fill` must be the same colour as the `tone` class, as a hex value for the shader.
  figure: Figure
  fill: string
  ink: string
  title: string
  note: string
  icon: ComponentType<{ className?: string }>
  tone: string
  // A dark card takes light chips, a light card dark ones.
  dark?: boolean
}

const CARDS: Card[] = [
  {
    tag: "Shop",
    figure: "flow",
    fill: "#5567ea",
    ink: "#1f2358",
    title: "Codes, licences and gift cards",
    note: "First on the shelf",
    icon: ShelfIcon,
    tone: "bg-indigo text-white",
    dark: true,
  },
  {
    tag: "Checkout",
    figure: "contour",
    fill: "#f4f4f6",
    ink: "#5567ea",
    title: "No account. No email.",
    note: "The link is the receipt",
    icon: NoAccountIcon,
    tone: "bg-ice text-ink",
  },
  {
    tag: "Payment",
    figure: "matrix",
    fill: "#26262e",
    ink: "#f4f4f6",
    title: "One shielded address per order",
    note: "Paid from your own wallet",
    icon: ZecIcon,
    tone: "bg-graphite text-white",
    dark: true,
  },
  {
    tag: "Price",
    figure: "sweep",
    fill: "#7a45f5",
    ink: "#f4f4f6",
    title: "In dollars, locked for 15 minutes",
    note: "Checked against two sources",
    icon: PriceLockIcon,
    tone: "bg-violet text-white",
    dark: true,
  },
  {
    tag: "Delivery",
    figure: "decode",
    fill: "#1f2358",
    ink: "#5567ea",
    title: "Sealed to a key your browser made",
    note: "Opens on the order page",
    icon: SealIcon,
    tone: "bg-navy text-white",
    dark: true,
  },
  {
    tag: "Keys",
    figure: "rings",
    fill: "#f4f4f6",
    ink: "#0b0b10",
    title: "The server holds a viewing key, nothing more",
    note: "It cannot move a coin",
    icon: KeyIcon,
    tone: "bg-ice text-ink",
  },
  {
    tag: "Token",
    figure: "diamond",
    fill: "#26262e",
    ink: "#7a45f5",
    title: "A token on Robinhood Chain, after the shop",
    note: "Not audited",
    icon: TokenIcon,
    tone: "bg-graphite text-white",
    dark: true,
  },
]

const COUNT = CARDS.length
const HALF = Math.floor(COUNT / 2)
// How far a drag must travel before it turns the deck instead of snapping back.
const TURN_PX = 48
// How far a neighbour is tipped away, as on a drum: the card above leans back, the one below
// leans forward. Turning the deck rolls each card up through these angles.
const TILT_DEG = 50

const pad = (n: number) => String(n).padStart(2, "0")

type DragStart = { x: number; y: number; card: number | null; touch: boolean }

// The deck in the hero: seven cards on a ring, the open one in the middle and its neighbours
// fading in at the top and bottom of the stage (sizes are the `.deck` rule in globals.css).
// It turns by itself: the open card's segment in the progress row fills up (`.auto-fill`) and the
// end of that animation turns the deck. The fill stops while the deck is paused, dragged or under
// the pointer. The cards roll upward: the open one tips back and leaves at the top while the next
// one tips up into its place. The owner asked for this roll in every mode, so it also runs with
// reduced motion; Pause stops it.
export function HeroDeck() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<DragStart | null>(null)

  const dragging = drag !== null
  const held = paused || hovered || dragging

  const turn = (by: number) => setActive((a) => (a + by + COUNT) % COUNT)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-card]")
    start.current = {
      x: event.clientX,
      y: event.clientY,
      card: card ? Number(card.dataset.card) : null,
      touch: event.pointerType === "touch",
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag(0)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const from = start.current
    // A finger scrolls the page up and down, so on touch the deck turns on a sideways swipe and
    // the cards do not follow the finger.
    if (!from || from.touch) return
    setDrag(event.clientY - from.y)
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const from = start.current
    if (!from) return
    start.current = null
    setDrag(null)
    const dx = event.clientX - from.x
    const dy = event.clientY - from.y
    const travel = from.touch ? dx : dy
    if (Math.abs(travel) > TURN_PX) {
      turn(travel < 0 ? 1 : -1)
    } else if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && from.card !== null) {
      setActive(from.card)
    }
  }

  function onPointerCancel() {
    start.current = null
    setDrag(null)
  }

  return (
    <>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="What Zolace is, in seven cards"
        data-dragging={dragging}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{ "--drag": `${drag ?? 0}px` } as CSSProperties}
        className="deck enter relative shrink-0 touch-pan-y overflow-hidden select-none lg:absolute lg:inset-0 lg:cursor-grab lg:active:cursor-grabbing"
      >
        {CARDS.map((card, index) => {
          // Distance from the open card, wrapped so the deck is a ring: -3 … 3.
          const d = ((index - active + COUNT + HALF) % COUNT) - HALF
          const near = Math.abs(d) <= 1
          const open = d === 0
          return (
            <div
              key={card.tag}
              data-card={index}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${COUNT}: ${card.tag}`}
              aria-hidden={d !== 0}
              data-open={d === 0}
              style={
                {
                  "--d": d,
                  "--r": `${Math.max(-1, Math.min(1, d)) * -TILT_DEG}deg`,
                  "--s": d === 0 ? 1 : 0.74,
                  opacity: near ? 1 : 0,
                  zIndex: COUNT - Math.abs(d),
                } as CSSProperties
              }
              className={cn(
                "deck-card @container absolute top-1/2 left-1/2 flex flex-col justify-between overflow-hidden rounded-3xl p-[calc(var(--card-w)*0.05)] will-change-transform",
                card.tone,
                d === 0 ? "shadow-[0_40px_80px_-32px_rgb(0_0_0/85%)]" : "lg:cursor-pointer",
                !near && "pointer-events-none"
              )}
            >
              <ShaderFill figure={card.figure} background={card.fill} ink={card.ink} active={d === 0} />

              {/* Head: the card's number out of seven, and what it is about. */}
              <div className="label-mono relative flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <card.icon className="size-[1.125rem]" />
                  {card.tag}
                </span>
                <span className={card.dark ? "text-white/65" : "text-ink/60"}>
                  {pad(index + 1)} / {pad(COUNT)}
                </span>
              </div>

              {/* Body: the claim, kept to the left so the graphic has the right half to itself.
                  It plays each time the card opens: the number spins into place, the claim
                  arrives word by word (`.card-word` in globals.css), the note decodes. */}
              <div className="relative @xs:max-w-[58%]">
                {/* The card's number again, large and drawn in outline, above the claim. */}
                <span
                  aria-hidden
                  className={cn(
                    "hidden pb-3 font-mono text-[calc(var(--card-w)*0.11)] leading-[0.8] font-medium tracking-[-0.08em] text-transparent @sm:block",
                    card.dark
                      ? "[-webkit-text-stroke:1.25px_rgb(255_255_255/0.32)]"
                      : "[-webkit-text-stroke:1.25px_rgb(11_11_16/0.24)]"
                  )}
                >
                  {open ? (
                    <Scramble text={pad(index + 1)} glyphs="0123456789" every={0} delay={60} />
                  ) : (
                    pad(index + 1)
                  )}
                </span>
                <p className="text-[clamp(1.25rem,calc(var(--card-w)*0.078),2.5rem)] leading-[1.04] font-medium tracking-[-0.035em] text-balance @xs:text-[calc(var(--card-w)*0.06)] @xs:leading-[1.06]">
                  {card.title.split(" ").map((word, at) => (
                    // The space sits outside the word, so the words still wrap and read as a sentence.
                    <Fragment key={at}>
                      <span style={{ "--i": at } as CSSProperties} className="card-word inline-block">
                        {word}
                      </span>{" "}
                    </Fragment>
                  ))}
                </p>
                <p
                  className={cn(
                    "label-mono mt-3 flex items-center gap-2 @xs:text-[0.625rem]",
                    card.dark ? "text-white/75" : "text-ink/65"
                  )}
                >
                  <span aria-hidden className="card-mark size-1 shrink-0 bg-current" />
                  {open ? (
                    <Scramble text={card.note} glyphs={LETTERS} every={0} delay={380} />
                  ) : (
                    card.note
                  )}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{ "--enter-delay": "420ms" } as CSSProperties}
        className="enter relative z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-3 pb-5 lg:absolute lg:right-4 lg:bottom-8 lg:justify-end lg:p-0"
      >
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="label-mono tabular-nums max-sm:sr-only">
            {pad(active + 1)} <span className="text-muted-foreground">/ {pad(COUNT)}</span>
          </span>
          {/* One segment per card. The open one is wider and fills while the deck waits to turn. */}
          <div className="flex items-center">
            {CARDS.map((card, index) => {
              const on = index === active
              return (
                <button
                  key={card.tag}
                  type="button"
                  aria-label={`Show card ${index + 1}: ${card.tag}`}
                  aria-current={on}
                  onClick={() => setActive(index)}
                  className="group/seg px-[3px] py-2.5 outline-none"
                >
                  <span
                    className={cn(
                      "relative block h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-500 ease-out group-focus-visible/seg:ring-3 group-focus-visible/seg:ring-ring/40",
                      on
                        ? "w-9 bg-primary/25 motion-reduce:bg-primary"
                        : "w-1.5 bg-foreground/15 group-hover/seg:bg-foreground/40"
                    )}
                  >
                    {on ? (
                      <span
                        onAnimationEnd={() => turn(1)}
                        style={
                          {
                            "--fill-time": "4.5s",
                            animationPlayState: held ? "paused" : undefined,
                          } as CSSProperties
                        }
                        className="auto-fill absolute inset-0 rounded-full bg-primary"
                      />
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" onClick={() => turn(-1)}>
            <ChevronUp aria-hidden />
            <span className="sr-only">Previous card</span>
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => turn(1)}>
            <ChevronDown aria-hidden />
            <span className="sr-only">Next card</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            {paused ? "Play" : "Pause"}
          </Button>
        </div>
      </div>
    </>
  )
}
