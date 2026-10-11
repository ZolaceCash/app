import { ChainIcon } from "@/components/site/chain-icons"
import { TokenIcon } from "@/components/site/icons"
import { Container, DotLabel, PillLink } from "@/components/site/primitives"
import { Reveal } from "@/components/site/reveal"

const FACTS = [
  { name: "Chain", value: "Robinhood Chain" },
  { name: "Holder reward", value: "NVDA, claimed from a contract" },
  { name: "Minimum to be listed", value: "3,000,000 tokens" },
  { name: "Paid from", value: "A fee on transfers, a share of orders" },
  { name: "On the chain", value: "Holdings, transfers and every claim" },
  { name: "Before launch", value: "An audit and a legal review" },
  { name: "Status", value: "Not live" },
]

// The one deep-indigo block on the page: the token and the reward to its holders, which come
// after the shop. Both are on a public chain, and the block says so.
export function Token() {
  return (
    <section id="token" className="pt-24 md:pt-32">
      <Container>
        <Reveal className="cut-2 rounded-3xl bg-navy">
          <div className="grid gap-12 p-7 md:p-12 lg:grid-cols-2 lg:gap-16 lg:p-16">
            <div>
              <TokenIcon className="mb-8 size-11" />
              <DotLabel>
                <span className="text-white/60">06 /</span>
                The token
              </DotLabel>
              <h2 className="mt-6 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-5xl">
                The shop first. A token with a <span className="text-brand">monthly reward</span> after it.
              </h2>
              <p className="mt-6 max-w-md leading-relaxed text-pretty text-white/70">
                The plan: wallets holding at least 3,000,000 tokens all month share a reward in
                NVDA, a stock token on the same chain, bought with a fee on each transfer of the
                token and a share of each order in the shop, and claimed from a contract. All of
                it is public on the chain: who holds the token, and what each wallet claims.
                There is no token today and no contract
                address. It will not launch before an audit and a legal review, and neither has
                been done.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <PillLink href="/whitepaper" variant="inverse" arrow>
                  Read the whitepaper
                </PillLink>
                <PillLink href="/vault" variant="ink">
                  How holders are rewarded
                </PillLink>
                <PillLink href="/roadmap" variant="ink">
                  See the roadmap
                </PillLink>
              </div>
            </div>

            <dl className="flex flex-col justify-center gap-1.5">
              {FACTS.map((fact) => (
                <div
                  key={fact.name}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg bg-white/[0.07] px-5 py-4"
                >
                  <dt className="label-mono text-white/60">{fact.name}</dt>
                  <dd className="flex items-center gap-2 font-mono text-sm">
                    {fact.name === "Chain" ? <ChainIcon className="size-4 text-brand" /> : null}
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
