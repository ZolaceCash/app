import { Check, Minus } from "lucide-react"

import { Container, DotLabel } from "@/components/site/primitives"
import { Reveal } from "@/components/site/reveal"

const NOT_LEARNED = [
  "Your name or your email. Checkout does not ask.",
  "The address or the wallet you paid from.",
  "The secret half of your order link.",
  "The item, once it is delivered: only a sealed copy stays.",
]

const KNOWN = [
  "What you ordered, and when.",
  "The amount, in dollars and in ZEC.",
  "Your IP address, each time a page loads.",
  "A refund address, if you ask for a refund.",
]

const NOTES = [
  { title: "No analytics", body: "No third-party analytics or trackers on any page." },
  {
    title: "No IP in the logs",
    body: "The app does not write IP addresses to its logs. Your IP still reaches the server, and the host it runs on and the network in front of it may keep access logs of their own.",
  },
  { title: "A short memory", body: "Orders are deleted some days after they are done." },
]

// The rule for this section: say what the server knows as plainly as what it does not.
export function Privacy() {
  return (
    <section id="privacy" className="pt-24 md:pt-32">
      <Container>
        <div className="grid gap-2.5 lg:grid-cols-3">
          <Reveal className="flex flex-col justify-between cut rounded-3xl bg-card p-7 md:p-9 lg:row-span-2">
            <div>
              <DotLabel>
                <span className="text-muted-foreground">04 /</span>
                Privacy, said plainly
              </DotLabel>
              <h2 className="mt-6 text-4xl leading-[1.0] font-medium tracking-[-0.04em] md:text-5xl">
                Private, <span className="text-brand">not invisible.</span>
              </h2>
              <p className="mt-6 leading-relaxed text-pretty text-muted-foreground">
                Shielded ZEC hides who paid. It does not hide that an order was placed. This is
                the whole list, both sides of it.
              </p>
            </div>
            <p className="mt-16 rounded-xl bg-secondary p-5 text-sm leading-relaxed text-muted-foreground">
              <span className="label-mono mb-2 block text-foreground">Not audited</span>
              No audit and no legal review have been done. Read this as a description of how the
              shop is built, not as a guarantee.
            </p>
          </Reveal>

          <Reveal delay={80} className="cut rounded-3xl bg-card p-7 md:p-9">
            <p className="label-mono text-brand">Never learned</p>
            <ul className="mt-6 space-y-4 leading-snug">
              {NOT_LEARNED.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <Check aria-hidden className="size-3" />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* The white tile is the one to read twice: what the server does know. */}
          <Reveal delay={160} className="cut rounded-3xl bg-ice p-7 text-ink md:p-9">
            <p className="label-mono">Known to the server</p>
            <ul className="mt-6 space-y-4 leading-snug">
              {KNOWN.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-ink/10">
                    <Minus aria-hidden className="size-3" />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </Reveal>

          <ul className="grid gap-2.5 sm:grid-cols-3 lg:col-span-2">
            {NOTES.map((note, index) => (
              <li key={note.title}>
                <Reveal delay={index * 70} className="h-full cut rounded-3xl bg-card p-6">
                  <p className="label-mono text-muted-foreground">0{index + 1}</p>
                  <p className="mt-6 font-medium tracking-[-0.02em]">{note.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{note.body}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  )
}
