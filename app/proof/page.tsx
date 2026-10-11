import type { Metadata } from "next";
import { Minus } from "lucide-react";

import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
import { Reveal } from "@/components/site/reveal";
import { NEVER_STORED, STORED } from "@/lib/proof";

export const metadata: Metadata = {
  title: "What the server stores",
  description: "Every table and every column the Zolace server keeps, listed from its own schema.",
};

const COLUMNS = STORED.reduce((count, table) => count + table.columns.length, 0);

// Not a promise but a listing: the tables below are read from the schema the server runs on.
export default function Proof() {
  return (
    <PageShell>
      <PageHead
        figure="flow"
        label="What the server stores"
        title="Every column, written out."
        facts={[`${STORED.length} tables`, `${COLUMNS} columns`, "Not audited"]}
      >
        This page is drawn from the database schema itself: add a column to the server and it
        appears here. It shows what is kept. It cannot prove what a server does with it, and no
        audit has been done.
      </PageHead>

      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-2.5">
          {STORED.map((table, index) => (
            <Reveal key={table.name} delay={index * 60} className="cut rounded-3xl bg-card p-6 md:p-8">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-3xl font-medium tracking-[-0.04em]">{table.title}</h2>
                <p className="label-mono text-muted-foreground">{table.columns.length} columns</p>
              </div>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">{table.about}</p>
              <dl className="mt-6 space-y-1.5">
                {table.columns.map((column) => (
                  <div
                    key={column.name}
                    className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3.5 sm:grid-cols-[10rem_1fr]"
                  >
                    <dt className="pt-0.5 font-mono text-xs text-brand">{column.name}</dt>
                    <dd className="leading-snug">{column.note}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          ))}
        </div>

        <Reveal className="cut rounded-3xl bg-ice p-6 text-ink md:p-8 lg:sticky lg:top-24">
          <p className="label-mono">In no table</p>
          <ul className="mt-6 space-y-4 leading-snug">
            {NEVER_STORED.map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-ink/10">
                  <Minus aria-hidden className="size-3" />
                </span>
                {line}
              </li>
            ))}
          </ul>
          <PillLink href="/docs/privacy" variant="ink" arrow className="mt-8">
            Privacy, in full
          </PillLink>
        </Reveal>
      </div>
    </PageShell>
  );
}
