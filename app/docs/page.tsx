import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { PageHead, PageShell } from "@/components/site/page-shell";
import { Reveal } from "@/components/site/reveal";
import { DOC_GROUPS, DOCS } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Docs",
  description: "How an order runs at Zolace: checkout, paying in ZEC, delivery, refunds, privacy and the token.",
};

const number = (index: number) => String(index + 1).padStart(2, "0");

// How many boxes marked "Not final" a page has: what is not decided or not built on it.
const openOn = (doc: (typeof DOCS)[number]) =>
  doc.sections.reduce((sum, section) => sum + section.blocks.filter((block) => "open" in block).length, 0);

// The docs open as the contents of a manual: where to start on the left, and every page as a row
// on the right, grouped the way the manual is read.
export default function Docs() {
  const [first] = DOCS;

  return (
    <PageShell>
      <PageHead
        figure="contour"
        label="Docs"
        title="How an order runs, page by page."
        facts={[`${DOCS.length} pages`, "Test orders only", "Not audited"]}
      >
        These pages describe how the shop is planned to work. Where something is not decided or
        not built, the page says so in a box marked &quot;Not final&quot;.
      </PageHead>

      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-2.5 lg:sticky lg:top-24">
          <Reveal>
            <Link
              href={`/docs/${first.slug}`}
              className="group block cut-2 rounded-3xl bg-indigo p-7 text-white transition-[clip-path] duration-300 outline-none hover:[--cut:2.75rem] focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:ring-inset md:p-10"
            >
              <span className="flex items-center justify-between">
                <span className="label-mono text-white/75">Start here · 01</span>
                <ArrowUpRight
                  aria-hidden
                  className="size-5 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </span>
              <span className="mt-16 block text-5xl leading-[0.95] font-medium tracking-[-0.05em] md:text-6xl">
                {first.title}
              </span>
              <span className="mt-5 block max-w-sm text-lg leading-snug text-white/80">{first.summary}</span>
              <span className="mt-8 flex flex-wrap gap-1.5">
                {first.sections.map((section) => (
                  <span key={section.id} className="label-mono rounded-md bg-white/15 px-2.5 py-1.5">
                    {section.heading}
                  </span>
                ))}
              </span>
            </Link>
          </Reveal>

          <Reveal delay={80} className="cut rounded-3xl bg-card p-6">
            <p className="label-mono text-muted-foreground">How to read them</p>
            <p className="mt-4 leading-relaxed">
              In order, they follow one order from checkout to the item. The last two are about what the
              server knows and about the token.
            </p>
            <p className="mt-4 rounded-xl bg-accent p-4 text-sm leading-relaxed text-foreground/85">
              <span className="label-mono mb-1.5 block text-accent-foreground">Not final</span>
              A box like this one marks what is not decided, not built or not checked.
            </p>
          </Reveal>
        </div>

        <div className="space-y-2.5">
          {DOC_GROUPS.map((group, at) => {
            const pages = DOCS.filter((doc) => doc.group === group);
            return (
              <Reveal key={group} delay={at * 80}>
                <section aria-labelledby={`group-${at}`} className="cut rounded-3xl bg-card p-4 md:p-6">
                  <div className="flex items-baseline justify-between px-2 pb-4">
                    <h2 id={`group-${at}`} className="label-mono text-muted-foreground">
                      {group}
                    </h2>
                    <p className="label-mono text-muted-foreground">{pages.length} pages</p>
                  </div>
                  <ol className="space-y-1.5">
                    {pages.map((doc) => {
                      const open = openOn(doc);
                      return (
                        <li key={doc.slug}>
                          <Link
                            href={`/docs/${doc.slug}`}
                            className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg bg-secondary px-4 py-4 transition-colors duration-200 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset md:px-5"
                          >
                            <span className="label-mono text-brand">{number(DOCS.indexOf(doc))}</span>
                            <span className="min-w-0">
                              <span className="block text-lg font-medium tracking-[-0.03em]">{doc.title}</span>
                              <span className="mt-1 block leading-snug text-muted-foreground">{doc.summary}</span>
                              <span className="label-mono mt-3 block text-muted-foreground">
                                {doc.sections.length} sections
                                {open > 0 ? ` · ${open} not final` : ""}
                              </span>
                            </span>
                            <ArrowUpRight
                              aria-hidden
                              className="size-4 text-muted-foreground transition-[transform,color] duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              </Reveal>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
