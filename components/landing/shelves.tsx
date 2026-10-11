import { Suspense } from "react"

import { LiveShelfGrid } from "@/components/shop/shelves-now"
import { Container, PillLink, SectionHead } from "@/components/site/primitives"
import { Reveal } from "@/components/site/reveal"
import { ShelfGrid } from "@/components/site/shelf-grid"

export function Shelves() {
  return (
    <section id="shop" className="pt-24 md:pt-32">
      <Container>
        <SectionHead
          index={1}
          label="The shop"
          title="Six shelves, stocked one at a time."
          action={
            <PillLink href="/shop" variant="secondary" arrow>
              See the shelves
            </PillLink>
          }
        >
          A shelf opens when its first item is in stock. Codes the shop holds are handed over at
          once; goods that a supplier makes when the order is paid follow.
        </SectionHead>
        <Reveal>
          {/* The plan is drawn first; what is on sale is read per request and marked on it. */}
          <Suspense fallback={<ShelfGrid />}>
            <LiveShelfGrid />
          </Suspense>
        </Reveal>
      </Container>
    </section>
  )
}
