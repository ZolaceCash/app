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
          Codes come first: vouchers, licences and gift cards. Goods that a supplier makes when
          the order is paid follow.
        </SectionHead>
        <Reveal>
          <ShelfGrid />
        </Reveal>
      </Container>
    </section>
  )
}
