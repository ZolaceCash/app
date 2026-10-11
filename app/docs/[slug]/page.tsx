import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { SectionView } from "@/components/site/blocks";
import { DocsNav } from "@/components/site/docs-nav";
import { PageShell } from "@/components/site/page-shell";
import { DotLabel } from "@/components/site/primitives";
import { Toc } from "@/components/site/toc";
import { DOCS, findDoc } from "@/lib/docs";

// Every doc is known at build time, so each page is prerendered.
export function generateStaticParams() {
  return DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const doc = findDoc(slug);
  return doc ? { title: `${doc.title} · Docs`, description: doc.summary } : {};
}

// The slug is read before anything is sent, so an unknown doc gets the not-found page (a 404 on
// the dev server; a built site sends its frame first and answers 200). That makes
// a navigation here wait for the server instead of showing a frame first, which `instant = false`
// declares as intended; every known slug is prerendered, so the wait is short.
export const instant = false;

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  return (
    <PageShell>
      <DocView slug={slug} />
    </PageShell>
  );
}

function DocView({ slug }: { slug: string }) {
  const doc = findDoc(slug);
  if (!doc) notFound();

  const at = DOCS.indexOf(doc);
  const previous = DOCS[at - 1];
  const next = DOCS[at + 1];

  return (
    <div className="grid items-start gap-2.5 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_14rem]">
      <DocsNav
        key={doc.slug}
        current={doc.slug}
        docs={DOCS.map(({ slug, title, group }) => ({ slug, title, group }))}
      />

      <article className="enter cut rounded-3xl bg-card p-7 md:p-12">
        <DotLabel>
          Docs · {String(at + 1).padStart(2, "0")} / {String(DOCS.length).padStart(2, "0")}
        </DotLabel>
        <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] text-balance md:text-5xl">
          {doc.title}
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-snug text-pretty text-muted-foreground">
          {doc.summary}
        </p>

        <div className="mt-12 max-w-[42rem] space-y-14">
          {doc.sections.map((section) => (
            <SectionView key={section.id} section={section} />
          ))}
        </div>

        <div className="mt-16 grid gap-2.5 sm:grid-cols-2">
          {previous ? (
            <Link
              href={`/docs/${previous.slug}`}
              className="group rounded-xl bg-secondary p-5 transition-colors duration-300 hover:bg-accent"
            >
              <span className="label-mono flex items-center gap-2 text-muted-foreground">
                <ArrowLeft
                  aria-hidden
                  className="size-3.5 transition-transform duration-300 group-hover:-translate-x-0.5"
                />
                Previous
              </span>
              <span className="mt-3 block font-medium tracking-[-0.02em]">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/docs/${next.slug}`}
              className="group rounded-xl bg-secondary p-5 text-right transition-colors duration-300 hover:bg-accent"
            >
              <span className="label-mono flex items-center justify-end gap-2 text-muted-foreground">
                Next
                <ArrowRight
                  aria-hidden
                  className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </span>
              <span className="mt-3 block font-medium tracking-[-0.02em]">{next.title}</span>
            </Link>
          ) : null}
        </div>
      </article>

      <aside className="hidden cut rounded-3xl bg-card py-5 pr-3 pl-2 xl:sticky xl:top-24 xl:block">
        <Toc
          label="On this page"
          items={doc.sections.map((section) => ({ id: section.id, title: section.heading }))}
        />
      </aside>
    </div>
  );
}
