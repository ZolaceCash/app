import { Copy, EyeOff } from "lucide-react"
import type { ReactNode } from "react"

import { Countdown, StatusRun } from "@/components/landing/live-mocks"
import { ZecIcon } from "@/components/site/chain-icons"
import { QrMock } from "@/components/site/qr-mock"
import { Scramble } from "@/components/site/scramble"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Drawings of screens that do not exist yet. They illustrate the text beside them, so they are
// hidden from assistive tech and their buttons cannot be reached. Small parts of them are alive
// (a countdown, a hash that decodes, an order that moves through its states) so they read as
// pages, not pictures.
function MockCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div aria-hidden inert className={cn("w-full rounded-2xl bg-secondary p-6", className)}>
      {children}
    </div>
  )
}

function CardLabel({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="label-mono flex items-center justify-between">
      <span>{children}</span>
      {note ? <span className="text-muted-foreground">{note}</span> : null}
    </div>
  )
}

// A field inside a drawing: one step darker than the card it sits in.
const FIELD = "rounded-lg bg-background/60"

export function OrderLinkMock() {
  return (
    <MockCard>
      <CardLabel>Your order link</CardLabel>
      <p className="mt-4 text-[0.9375rem] leading-snug">
        This link is the receipt. Whoever has it can open the order, so keep it somewhere safe.
      </p>
      <p className={cn(FIELD, "mt-5 truncate px-4 py-3 font-mono text-xs")}>
        /o/7Q2M-K4TD
        <Scramble text="#f3a9c0…e21b" className="text-brand" />
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button>
          <Copy />
          Copy the link
        </Button>
        <Button variant="outline">I saved it</Button>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        The part after # never leaves this browser.
      </p>
    </MockCard>
  )
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="label-mono text-muted-foreground">{name}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  )
}

export function PaymentMock() {
  return (
    <MockCard>
      <CardLabel note="Sample">Waiting for your payment</CardLabel>
      <div className="mt-4 grid grid-cols-[6.5rem_1fr] items-center gap-5">
        <div className="rounded-lg bg-white p-2">
          <QrMock className="w-full" />
        </div>
        <dl>
          <Row name="Item">$10.00</Row>
          <Row name="Send">
            <span className="inline-flex items-center gap-1.5">
              <ZecIcon className="size-4 text-brand" />
              0.0081 ZEC
            </span>
          </Row>
          <Row name="Held for">
            <span className="text-brand">
              <Countdown />
            </span>
          </Row>
        </dl>
      </div>
      <p className={cn(FIELD, "mt-4 flex items-center justify-between gap-4 px-4 py-3")}>
        <span className="label-mono text-muted-foreground">To</span>
        <Scramble text="u1q8f4mz…c0d9x7k2" every={7000} className="truncate font-mono text-xs" />
      </p>
      <p className="mt-4 text-sm text-muted-foreground">This address is used once.</p>
    </MockCard>
  )
}

export function StatusMock() {
  return (
    <MockCard>
      <CardLabel note="Sample">Order status</CardLabel>
      <StatusRun />
    </MockCard>
  )
}

export function ItemMock() {
  return (
    <MockCard>
      <CardLabel note="Delivered">Your item</CardLabel>
      <p className="mt-4 text-[0.9375rem] leading-snug">
        Software licence. Decrypted in this browser, and nowhere else.
      </p>
      <p className={cn(FIELD, "mt-5 px-4 py-3 text-center font-mono text-xs tracking-[0.2em]")}>
        <Scramble
          text="VM4K9 QX2TD 7HN3P L8WZ6"
          sealed="••••• ••••• ••••• •••••"
          glyphs="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
          every={7000}
        />
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button>
          <Copy />
          Copy the key
        </Button>
        <Button variant="outline">
          <EyeOff />
          Hide
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        The server keeps a sealed copy it cannot read.
      </p>
    </MockCard>
  )
}
