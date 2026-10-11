import { ShopToday } from "@/components/site/shop-status"
import { TokenStatus } from "@/components/site/token-status"
import type { Block, Section } from "@/lib/content"

// Draws the long-form content of lib/docs.ts and lib/whitepaper.ts.
function BlockView({ block }: { block: Block }) {
  if ("p" in block) {
    return <p className="leading-[1.7] text-pretty text-foreground/80">{block.p}</p>
  }

  if ("list" in block) {
    return (
      <ul className="space-y-2.5">
        {block.list.map((item) => (
          <li key={item} className="flex gap-3.5 leading-[1.6] text-foreground/80">
            <span aria-hidden className="mt-[0.7em] size-1.5 shrink-0 bg-brand" />
            {item}
          </li>
        ))}
      </ul>
    )
  }

  if ("rows" in block) {
    return (
      <dl className="space-y-1.5">
        {block.rows.map(([name, value]) => (
          <div
            key={name}
            className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-4 sm:grid-cols-[11rem_1fr]"
          >
            <dt className="label-mono pt-0.5 text-muted-foreground">{name}</dt>
            <dd className="leading-snug">{value}</dd>
          </div>
        ))}
      </dl>
    )
  }

  if ("token" in block) return <TokenStatus />
  if ("shop" in block) return <ShopToday />

  // Not decided, not built or not checked: set apart so it cannot be read as a promise.
  return (
    <p className="rounded-xl bg-accent p-5 leading-relaxed text-accent-foreground">
      <span className="label-mono mb-2 block">Not final</span>
      <span className="text-foreground/85">{block.open}</span>
    </p>
  )
}

// A section's text without its heading, for a page that sets the heading itself.
export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  )
}

export function SectionView({ section, index }: { section: Section; index?: number }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`}>
      <h2
        id={`${section.id}-title`}
        className="flex items-baseline gap-4 text-2xl leading-tight font-medium tracking-[-0.035em] md:text-[1.75rem]"
      >
        {index !== undefined ? (
          <span className="label-mono shrink-0 text-brand">{String(index).padStart(2, "0")}</span>
        ) : null}
        {section.heading}
      </h2>
      <div className="mt-6">
        <Blocks blocks={section.blocks} />
      </div>
    </section>
  )
}
