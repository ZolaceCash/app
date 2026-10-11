import { ItemMock, OrderLinkMock, PaymentMock, StatusMock } from "@/components/landing/mocks"
import { StepExplorer, type Step } from "@/components/landing/step-explorer"
import { Container, SectionHead } from "@/components/site/primitives"
import { Reveal } from "@/components/site/reveal"

const STEPS: Step[] = [
  {
    name: "Check out",
    badge: "No sign-up",
    body: "Pick an item. Checkout asks nothing about you: the order gets its own link, and that link is the receipt.",
    points: ["No account", "No email", "One link per order"],
    screen: <OrderLinkMock />,
  },
  {
    name: "Pay",
    badge: "15 min lock",
    body: "The price is set in dollars and held in ZEC for 15 minutes. You pay from your own wallet to a shielded address that is used once.",
    points: ["One-time address", "Your own wallet", "Two price sources"],
    screen: <PaymentMock />,
  },
  {
    name: "Confirm",
    badge: "3 blocks",
    body: "The page shows your payment as soon as the network sees it and confirms it after three blocks, about four minutes.",
    points: ["Seen on the network", "Three blocks", "A rule for odd cases"],
    screen: <StatusMock />,
  },
  {
    name: "Open",
    badge: "Sealed",
    body: "The item is encrypted to a key your browser made and opens on the order page. The server keeps a sealed copy only.",
    points: ["Opens in your browser", "Ciphertext on the server", "Deleted after some days"],
    screen: <ItemMock />,
  },
]

export function How() {
  return (
    <section id="how" className="pt-24 md:pt-32">
      <Container>
        <SectionHead index={2} label="How it works" title="Four steps, all on one page.">
          No sign-up at the start and no claim at the end. You pay once, to an address made for
          your order, and the item appears where you paid.
        </SectionHead>
        <Reveal>
          <StepExplorer steps={STEPS} />
        </Reveal>
      </Container>
    </section>
  )
}
