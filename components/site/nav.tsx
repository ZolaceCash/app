import Link from "next/link"
import { Menu } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { NavRoot } from "@/components/site/nav-root"
import { Container, Logo, LogoMark, PillLink } from "@/components/site/primitives"

// The close mark, drawn from polygons like the logo: one stroke whole, the other cut in two.
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} fill="currentColor">
      <polygon points="3,2 6.5,2 17,18 13.5,18" />
      <polygon points="13.5,2 17,2 12.3,9.16 10.55,6.5" />
      <polygon points="7.7,10.84 9.45,13.5 6.5,18 3,18" />
    </svg>
  )
}

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/docs", label: "Docs" },
  { href: "/whitepaper", label: "Whitepaper" },
]

// Two sides: the logo stands bare on the left, and only the menu on the right has a panel.
// Nothing is drawn behind them, so the page scrolls straight through. To keep the logo from
// running into what scrolls under it, it fades out once the page moves and its mark appears
// inside the panel instead (NavRoot sets `data-scrolled`; the classes below react to it).
export function Nav() {
  return (
    <NavRoot>
      <Container className="flex h-20 items-center justify-between">
        <Link
          href="/"
          aria-label="Zolace, home"
          className="pointer-events-auto flex h-12 items-center pl-3 transition-[opacity,visibility,translate] duration-300 ease-out group-data-[scrolled=true]/nav:invisible group-data-[scrolled=true]/nav:-translate-x-2 group-data-[scrolled=true]/nav:opacity-0 md:pl-4"
        >
          <Logo />
        </Link>

        <div className="pointer-events-auto flex h-14 items-center rounded-2xl bg-secondary px-2">
          <Link
            href="/"
            aria-label="Zolace, home"
            className="invisible flex h-10 w-0 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background/60 opacity-0 transition-[width,margin,opacity,visibility] duration-500 ease-out group-data-[scrolled=true]/nav:visible group-data-[scrolled=true]/nav:mr-1 group-data-[scrolled=true]/nav:w-10 group-data-[scrolled=true]/nav:opacity-100"
          >
            <LogoMark className="size-4 shrink-0" />
          </Link>

          <nav aria-label="Main" className="hidden items-center lg:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="label-mono rounded-lg px-3.5 py-2.5 text-muted-foreground transition-colors duration-200 hover:bg-foreground/[0.07] hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <p className="label-mono mx-1 hidden h-10 items-center gap-2.5 rounded-lg bg-background/60 px-3 text-muted-foreground xl:flex">
            <span aria-hidden className="live-dot size-1.5 rounded-full bg-signal" />
            Preview
          </p>

          <PillLink href="/shop" arrow>
            {/* The full label does not fit beside the logo on a phone. */}
            <span className="sm:hidden">Shop</span>
            <span className="max-sm:hidden">Browse the shop</span>
          </PillLink>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-1 lg:hidden">
                <Menu aria-hidden />
                <span className="sr-only">Open the menu</span>
              </Button>
            </SheetTrigger>
            {/* A short panel hung from the top right, not a full-height drawer. Its outline is the
                `.menu-panel` shape in app/globals.css; the padding keeps clear of its cuts. */}
            <SheetContent
              showCloseButton={false}
              className="menu-panel gap-0 bg-secondary data-[side=right]:top-3 data-[side=right]:right-3 data-[side=right]:bottom-auto data-[side=right]:h-[max(50svh,25rem)] data-[side=right]:w-[min(21rem,calc(100vw-1.5rem))] data-[side=right]:border-l-0"
            >
              <SheetHeader className="flex-row items-center justify-between gap-4 py-4 pr-4 pl-8">
                <div>
                  <SheetTitle className="label-mono text-muted-foreground">Menu</SheetTitle>
                  <SheetDescription className="sr-only">
                    The pages of the site and the shop.
                  </SheetDescription>
                </div>
                <SheetClose asChild>
                  <Button variant="outline" size="icon">
                    <CloseIcon className="size-4" />
                    <span className="sr-only">Close the menu</span>
                  </Button>
                </SheetClose>
              </SheetHeader>
              <nav aria-label="Main" className="flex flex-col pr-4 pl-5">
                {LINKS.map((link, index) => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      className="group flex items-baseline gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-foreground/[0.06]"
                    >
                      <span className="label-mono text-muted-foreground transition-colors group-hover:text-brand">
                        0{index + 1}
                      </span>
                      <span className="text-xl font-medium tracking-[-0.03em]">{link.label}</span>
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto pb-6 pl-8">
                <SheetClose asChild>
                  <PillLink href="/shop" arrow>
                    Browse the shop
                  </PillLink>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </Container>
    </NavRoot>
  )
}
