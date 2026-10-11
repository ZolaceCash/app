import Link from "next/link"

import { Container, Logo } from "@/components/site/primitives"

const LINKS = [
  { href: "/#shop", label: "The shop" },
  { href: "/#how", label: "How it works" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/#rules", label: "The rules" },
  { href: "/#token", label: "The token" },
  { href: "/shop", label: "Browse the shelves" },
]

const READ = [
  { href: "/proof", label: "What is stored" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/docs", label: "Docs" },
  { href: "/whitepaper", label: "Whitepaper" },
]

const PLAINLY = ["Not audited", "No legal review", "Not total privacy", "Not affiliated with Robinhood"]

export function Footer() {
  return (
    <footer className="pt-10 pb-6">
      <Container>
        <div className="grid gap-10 px-3 md:px-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs leading-relaxed text-muted-foreground">
              Digital goods with no account, paid in shielded ZEC.
            </p>
            <p className="label-mono mt-5 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-card py-2.5 pr-4 pl-3.5">
              <span className="text-muted-foreground">Status</span>
              Preview. Test orders only, no real payments.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-16 gap-y-10 sm:grid-cols-3">
            <nav aria-label="Pages">
              <p className="label-mono text-muted-foreground">Pages</p>
              <ul className="mt-4 space-y-2.5">
                {LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="font-medium tracking-[-0.01em] transition-colors hover:text-brand"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Read">
              <p className="label-mono text-muted-foreground">Read</p>
              <ul className="mt-4 space-y-2.5">
                {READ.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="font-medium tracking-[-0.01em] transition-colors hover:text-brand"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div>
              <p className="label-mono text-muted-foreground">Said plainly</p>
              <ul className="mt-4 space-y-2.5">
                {PLAINLY.map((line) => (
                  <li key={line} className="font-medium tracking-[-0.01em]">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="label-mono mt-16 flex flex-wrap items-center justify-between gap-2 px-3 text-muted-foreground md:px-4">
          <span>Pay shielded. Get the goods.</span>
          <span>Zolace, 2026</span>
        </div>
      </Container>
    </footer>
  )
}
