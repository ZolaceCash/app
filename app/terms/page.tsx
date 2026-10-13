import type { Metadata } from "next";

import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
import { Reveal } from "@/components/site/reveal";
import { TERMS, TERMS_CHANGED } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms the Zolace shop runs by: an order, the price, what is owed back, other sellers, and what is kept.",
};

// The shop's terms (lib/terms.ts): the rules as the site applies them, on one page. It says first
// that no lawyer has reviewed them.
export default function Terms() {
  return (
    <PageShell>
      <PageHead
        figure="contour"
        label="Terms"
        title="The shop's terms."
        facts={[`Last changed ${TERMS_CHANGED}`, "No legal review", "The shop only"]}
      >
        The rules the shop runs by, in one place. They are written from what the site does, not by a lawyer: no legal
        review of them exists. They cover buying and selling here, and not the token.
      </PageHead>

      <div className="grid items-start gap-2.5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label="The terms" className="cut rounded-3xl bg-card p-6 lg:sticky lg:top-24">
          <p className="label-mono text-muted-foreground">On this page</p>
          <ol className="mt-5 space-y-2.5 text-sm leading-snug">
            {TERMS.map((term, index) => (
              <li key={term.id} className="flex gap-3">
                <span className="label-mono pt-0.5 text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <a href={`#${term.id}`} className="underline-offset-4 hover:text-brand hover:underline">
                  {term.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-2.5">
          {TERMS.map((term, index) => (
            <Reveal key={term.id} id={term.id} className="cut scroll-mt-28 rounded-3xl bg-card p-6 md:p-8">
              <p className="label-mono text-brand">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-4 text-2xl leading-[1.08] font-medium tracking-[-0.035em] text-balance md:text-3xl">
                {term.heading}
              </h2>
              <ul className="mt-5 space-y-1.5">
                {term.lines.map((line) => (
                  <li key={line} className="rounded-lg bg-secondary px-5 py-3.5 leading-snug text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}

          <div className="flex flex-col gap-5 cut rounded-3xl bg-card p-6 md:flex-row md:items-center md:justify-between">
            <p className="max-w-xl leading-relaxed text-muted-foreground">
              The docs say the same at more length, one page per subject. The page of what is stored lists every column
              the server keeps.
            </p>
            <div className="flex flex-wrap gap-2">
              <PillLink href="/docs" variant="secondary" arrow>
                The docs
              </PillLink>
              <PillLink href="/proof" variant="outline">
                What is stored
              </PillLink>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
