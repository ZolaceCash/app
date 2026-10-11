import type { ReactNode } from "react"

import { Footer } from "@/components/site/footer"
import { Nav } from "@/components/site/nav"
import { Container, DotLabel, LETTERS } from "@/components/site/primitives"
import { Scramble } from "@/components/site/scramble"
import { ShaderFill, type Figure } from "@/components/site/shader-fill"

// The frame of every page that is not the landing: nav, room for the fixed nav, footer.
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <Nav />
      <main className="flex-1 pt-28 md:pt-36">
        <Container>{children}</Container>
      </main>
      <Footer />
    </div>
  )
}

// The head of such a page: a banner with label, title, one paragraph and a row of small facts on
// the left, and the site's shader graphic on the right. On a phone the text needs the whole
// width, so the graphic is a strip under it (the extra bottom padding is its room).
export function PageHead({
  label,
  title,
  children,
  facts,
  figure = "contour",
}: {
  label: string
  title: string
  children: ReactNode
  facts?: string[]
  figure?: Figure
}) {
  return (
    <div className="enter cut-2 relative isolate mb-2.5 overflow-hidden rounded-3xl bg-card px-6 pt-10 pb-40 md:px-10 md:py-14">
      {/* #111114 is the `card` colour: the canvas has to match the surface it lies on. */}
      <ShaderFill figure={figure} background="#111114" ink="#5567ea" clear="left" className="max-md:hidden" />
      <ShaderFill figure={figure} background="#111114" ink="#5567ea" clear="strip" className="md:hidden" />
      <div className="relative md:max-w-[56%]">
        <DotLabel>
          <Scramble text={label} every={0} glyphs={LETTERS} />
        </DotLabel>
        <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-6xl">
          {title}
        </h1>
        <p className="mt-6 max-w-xl leading-relaxed text-pretty text-muted-foreground">{children}</p>
        {facts ? (
          <ul className="mt-6 flex flex-wrap gap-1.5">
            {facts.map((fact) => (
              <li key={fact} className="label-mono rounded-md bg-secondary px-3 py-2">
                {fact}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
