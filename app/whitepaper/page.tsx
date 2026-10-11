import type { Metadata } from "next";

import { Blocks } from "@/components/site/blocks";
import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
import { Reveal } from "@/components/site/reveal";
import { WHITEPAPER, WHITEPAPER_SECTIONS } from "@/lib/whitepaper";

export const metadata: Metadata = {
  title: "Whitepaper",
  description:
    "The design of Zolace in one document: no account, one shielded address per order, a viewing key only.",
};

const number = (index: number) => String(index + 1).padStart(2, "0");

// What stands on the cover beside the abstract.
const FACTS: [string, string][] = [
  ["Version", WHITEPAPER.version],
  ["Date", WHITEPAPER.date],
  ["Sections", String(WHITEPAPER_SECTIONS.length)],
  ["Audit", "None"],
  ["Legal review", "None"],
  ["Status", "A draft. It will change"],
];

// The whitepaper is laid out as a document, not as a page of the docs: a cover with the abstract
// on a white sheet, the contents as one strip that stays in reach, and then a row per section
// with its number and heading in the margin and the text beside it.
export default function Whitepaper() {
  return (
    <PageShell>
      <PageHead
        figure="decode"
        label="Whitepaper"
        title="A shop that asks for nothing but the payment."
        facts={[WHITEPAPER.version, WHITEPAPER.date, "Not audited", "Not an offer"]}
      >
        The design in one document: what is built around, what the server can learn, and what is
        still open. It is a draft and will change.
      </PageHead>

      {/* The cover. */}
      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Reveal className="cut-2 rounded-3xl bg-ice p-7 text-ink md:p-12">
          <p className="label-mono">Abstract</p>
          <p className="mt-6 max-w-[46rem] text-xl leading-[1.45] tracking-[-0.015em] text-pretty md:text-2xl md:leading-[1.4]">
            {WHITEPAPER.abstract}
          </p>
        </Reveal>

        <Reveal delay={80} className="flex flex-col justify-between cut rounded-3xl bg-card p-6">
          <dl className="space-y-1.5">
            {FACTS.map(([name, value]) => (
              <div key={name} className="flex items-baseline justify-between gap-4 rounded-lg bg-secondary px-4 py-3">
                <dt className="label-mono text-muted-foreground">{name}</dt>
                <dd className="text-right font-mono text-sm">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            <PillLink href="/roadmap" arrow>
              See the roadmap
            </PillLink>
            <PillLink href="/docs" variant="secondary">
              Read the docs
            </PillLink>
          </div>
        </Reveal>
      </div>

      {/* The contents: one strip of numbered links that stays under the nav while the paper is read. */}
      <nav
        aria-label="Contents"
        className="sticky top-24 z-20 mt-2.5 cut rounded-3xl bg-secondary px-3 py-2.5 md:px-4"
      >
        <ol className="flex gap-1 overflow-x-auto">
          {WHITEPAPER_SECTIONS.map((section, index) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors duration-200 outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <span className="label-mono text-[0.625rem] text-brand">{number(index)}</span>
                {section.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* The paper itself: a row per section. */}
      <div className="mt-2.5 space-y-2.5">
        {WHITEPAPER_SECTIONS.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="grid scroll-mt-44 gap-x-12 gap-y-8 cut rounded-3xl bg-card p-7 md:p-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:p-12"
          >
            <div className="lg:sticky lg:top-44 lg:self-start">
              <p
                aria-hidden
                className="font-mono text-6xl leading-none font-medium tracking-[-0.06em] text-transparent [-webkit-text-stroke:1.25px_rgb(255_255_255/0.32)] md:text-7xl"
              >
                {number(index)}
              </p>
              <h2
                id={`${section.id}-title`}
                className="mt-5 text-2xl leading-tight font-medium tracking-[-0.035em] text-balance md:text-[1.75rem]"
              >
                {section.heading}
              </h2>
            </div>
            <div className="max-w-[44rem]">
              <Blocks blocks={section.blocks} />
            </div>
          </section>
        ))}
      </div>

      <div className="mt-2.5 flex flex-col gap-5 cut rounded-3xl bg-card p-6 md:flex-row md:items-center md:justify-between">
        <p className="max-w-md leading-relaxed text-muted-foreground">
          End of {WHITEPAPER.version}. The roadmap lists the stages in order; the docs describe an order
          step by step.
        </p>
        <div className="flex flex-wrap gap-2">
          <PillLink href="/roadmap" arrow>
            See the roadmap
          </PillLink>
          <PillLink href="/docs" variant="secondary">
            Read the docs
          </PillLink>
        </div>
      </div>
    </PageShell>
  );
}
