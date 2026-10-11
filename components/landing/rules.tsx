import { CountUp } from "@/components/site/count-up"
import { Container, SectionHead } from "@/components/site/primitives"
import { Reveal } from "@/components/site/reveal"
import { cn } from "@/lib/utils"

const RULES = [
  {
    figure: 15,
    unit: "min",
    title: "Price lock",
    body: "The price in ZEC is held this long. After that the order expires and the item goes back on the shelf.",
    box: "bg-indigo text-white",
    soft: "text-white/75",
  },
  {
    figure: 3,
    unit: "blocks",
    title: "Confirmation",
    body: "About four minutes. The item is handed over when the third block arrives.",
    box: "bg-card",
    soft: "text-muted-foreground",
  },
  {
    figure: 2,
    unit: "%",
    title: "Price check",
    body: "The ZEC price comes from two sources. If they differ by more than this, no price is quoted.",
    box: "bg-card",
    soft: "text-muted-foreground",
  },
  {
    figure: "By",
    unit: "hand",
    title: "Refunds",
    body: "Sent from the owner's wallet to an address you give, less the network fee.",
    box: "bg-card",
    soft: "text-muted-foreground",
  },
]

const NEVER = ["Accounts", "Email", "Spending keys", "Custody", "Analytics"]

export function Rules() {
  return (
    <section id="rules" className="pt-24 md:pt-32">
      <Container>
        <SectionHead index={5} label="The order rules" title="Every number, written down.">
          An order follows the same four rules every time. None of them depends on who you are.
        </SectionHead>

        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {RULES.map((rule, index) => (
            <li key={rule.title}>
              <Reveal
                delay={index * 70}
                className={cn("flex h-full flex-col cut rounded-3xl p-6", rule.box)}
              >
                <p className={cn("label-mono flex justify-between", rule.soft)}>
                  <span>{rule.title}</span>
                  <span>0{index + 1}</span>
                </p>
                <p className="mt-12 flex items-baseline gap-1.5">
                  <span className="font-mono text-[4rem] leading-[0.85] font-medium tracking-[-0.06em]">
                    {typeof rule.figure === "number" ? <CountUp to={rule.figure} /> : rule.figure}
                  </span>
                  <span className={cn("font-mono text-lg", rule.soft)}>{rule.unit}</span>
                </p>
                <p className={cn("mt-6 text-sm leading-relaxed", rule.soft)}>{rule.body}</p>
              </Reveal>
            </li>
          ))}
        </ul>

        <Reveal className="mt-2.5 flex flex-col gap-5 cut rounded-3xl bg-card p-6 md:flex-row md:items-center md:justify-between">
          <p className="text-lg font-medium tracking-[-0.03em]">Never on the server</p>
          <ul className="flex flex-wrap gap-1.5">
            {NEVER.map((item) => (
              <li key={item} className="label-mono rounded-md bg-secondary px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  )
}
