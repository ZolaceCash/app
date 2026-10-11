import { Container, PillLink } from "@/components/site/primitives"
import { Reveal } from "@/components/site/reveal"
import { ShaderFill } from "@/components/site/shader-fill"

export function Closing() {
  return (
    <section className="pt-2.5">
      <Container>
        <Reveal className="cut-2 relative isolate flex flex-col gap-10 overflow-hidden rounded-3xl bg-indigo p-7 pb-40 text-white md:p-12 lg:p-16">
          {/* #5567ea is the indigo of the banner. On a phone the graphic is a strip under the text. */}
          <ShaderFill figure="flow" background="#5567ea" ink="#1f2358" clear="left" className="max-md:hidden" />
          <ShaderFill figure="flow" background="#5567ea" ink="#1f2358" clear="strip" className="md:hidden" />
          <div className="relative">
            <p className="label-mono text-white/75">
              No account. Paid in shielded ZEC. Opened in your browser.
            </p>
            <p className="mt-6 text-[clamp(3rem,8vw,6.5rem)] leading-[0.9] font-medium tracking-[-0.05em]">
              Just the goods.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <PillLink href="/shop" variant="inverse" size="lg" arrow>
              Browse the shop
            </PillLink>
            <PillLink href="/#how" variant="ink" size="lg">
              How it works
            </PillLink>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
