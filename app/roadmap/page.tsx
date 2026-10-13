import type { Metadata } from "next";

import { TokenIcon } from "@/components/site/icons";
import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
import { Reveal } from "@/components/site/reveal";
import { ShopWord } from "@/components/site/shop-status";
import { TokenStatus } from "@/components/site/token-status";
import { STAGES, STATUS_LABEL, type Stage } from "@/lib/roadmap";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "The stages Zolace is built in, and the test that ends each one. No dates.",
};

const name = (stage: Stage) => (stage.code === "P" ? "Preview" : `Stage 0${stage.code}`);

// The colour of a stage on the track, by where it stands.
const BAR: Record<Stage["status"], string> = {
  done: "bg-foreground",
  now: "bg-primary",
  building: "bg-violet",
  planned: "bg-foreground/15",
  gated: "bg-foreground/15",
};

// The roadmap is a board, not a list: the stage whose turn it is is the one large tile, with
// today's state beside it and anything started ahead of its turn under it; what is done sits small
// below, then what comes after, and the token keeps its own block. The track across the top keeps
// the order, which the board gives up.
export default function Roadmap() {
  const now = STAGES.find((stage) => stage.status === "now");
  const ahead = STAGES.filter((stage) => stage.status === "building");
  const done = STAGES.filter((stage) => stage.status === "done");
  const planned = STAGES.filter((stage) => stage.status === "planned");
  const gated = STAGES.filter((stage) => stage.status === "gated");

  return (
    <PageShell>
      <PageHead
        figure="rings"
        label="Roadmap"
        title="Six stages, and the test that ends each."
        facts={["No dates", "One stage at a time", "The token apart from the shop"]}
      >
        A stage is finished when its test passes, not when a date arrives. The first one decides
        how the rest is built, so nothing after it is promised in weeks.
      </PageHead>

      {/* The track: every stage in order, each one a way to its tile. */}
      <Reveal className="cut rounded-3xl bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="label-mono text-muted-foreground">Where it stands</p>
          <p className="label-mono text-muted-foreground">
            {done.length} of {STAGES.length} done
          </p>
        </div>
        <ol className="mt-6 grid grid-cols-7 gap-1 md:gap-1.5">
          {STAGES.map((stage) => (
            <li key={stage.code}>
              <a
                href={`#stage-${stage.code}`}
                className="group block rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <span aria-hidden className={cn("block h-1.5 rounded-full", BAR[stage.status])} />
                <span className="label-mono mt-3 block transition-colors duration-200 group-hover:text-brand">
                  {stage.code === "P" ? "P" : `0${stage.code}`}
                </span>
                <span className="label-mono mt-1 hidden text-muted-foreground md:block">
                  {STATUS_LABEL[stage.status]}
                </span>
                <span className="sr-only">
                  {name(stage)}: {stage.title}, {STATUS_LABEL[stage.status]}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </Reveal>

      {/* What is being worked on: the one large tile, with today's state beside it. */}
      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-12">
        {now ? <Large stage={now} className="bg-indigo lg:col-span-8" /> : null}

        <Reveal delay={80} className="flex flex-col justify-between cut rounded-3xl bg-card p-6 md:p-8 lg:col-span-4">
          <div>
            <p className="label-mono text-muted-foreground">Today</p>
            <p className="mt-6 text-2xl leading-tight font-medium tracking-[-0.035em]">
              {now ? `Now at ${name(now).toLowerCase()}: ${now.title.toLowerCase()}.` : "No stage is in turn."}
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              <ShopWord part="today" />
            </p>
          </div>
          <div className="mt-10 flex flex-wrap gap-2">
            <PillLink href="/shop" arrow>
              <ShopWord part="order" />
            </PillLink>
            <PillLink href="/whitepaper" variant="secondary">
              Read the whitepaper
            </PillLink>
          </div>
        </Reveal>

        {ahead.map((stage) => (
          <Large key={stage.code} stage={stage} className="bg-violet lg:col-span-12" />
        ))}
      </div>

      {/* Behind us: small tiles, one per finished stage. */}
      <Group label="Done" count={done.length} />
      <ul className="grid gap-2.5 md:grid-cols-2">
        {done.map((stage, index) => (
          <li key={stage.code}>
            <Reveal
              id={`stage-${stage.code}`}
              delay={index * 60}
              className="flex h-full scroll-mt-28 flex-col cut rounded-3xl bg-card p-6"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="label-mono text-muted-foreground">{name(stage)}</p>
                <p className="label-mono rounded-md bg-secondary px-2.5 py-1.5 text-muted-foreground">
                  {STATUS_LABEL[stage.status]}
                </p>
              </div>
              <h2 className="mt-8 text-2xl leading-tight font-medium tracking-[-0.035em]">{stage.title}</h2>
              <p className="mt-3 flex-1 leading-snug text-muted-foreground">{stage.doneWhen}</p>
              <ul className="mt-6 space-y-1.5">
                {stage.work.map((item) => (
                  <li key={item} className="rounded-lg bg-secondary px-4 py-3 text-sm leading-snug">
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </li>
        ))}
      </ul>

      {/* Ahead: wider tiles, in the order they come. */}
      {planned.length > 0 ? <Group label="After that" count={planned.length} /> : null}
      <ul className="grid gap-2.5 md:grid-cols-2">
        {planned.map((stage, index) => (
          <li key={stage.code}>
            <Reveal
              id={`stage-${stage.code}`}
              delay={index * 60}
              className="h-full scroll-mt-28 cut rounded-3xl bg-card p-6 md:p-8"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="label-mono text-muted-foreground">{name(stage)}</p>
                <p className="label-mono rounded-md bg-secondary px-2.5 py-1.5">{STATUS_LABEL[stage.status]}</p>
              </div>
              <h2 className="mt-8 text-3xl leading-none font-medium tracking-[-0.04em] md:text-4xl">
                {stage.title}
              </h2>
              <div className="mt-8 space-y-8">
                <Work stage={stage} soft="text-muted-foreground" />
                <div>
                  <p className="label-mono text-muted-foreground">Done when</p>
                  <p className="mt-3 leading-snug">{stage.doneWhen}</p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>

      {/* Behind a gate: the token, in the deep indigo it has everywhere on the site. */}
      <Group label="Behind a gate" count={gated.length} />
      {gated.map((stage) => (
        <Reveal
          key={stage.code}
          id={`stage-${stage.code}`}
          className="cut-2 scroll-mt-28 rounded-3xl bg-navy p-7 text-white md:p-12"
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="label-mono text-white/70">{name(stage)}</p>
                <p className="label-mono rounded-md bg-white/[0.08] px-2.5 py-1.5">{STATUS_LABEL[stage.status]}</p>
              </div>
              <h2 className="mt-8 flex items-center gap-3 text-4xl leading-none font-medium tracking-[-0.04em] md:text-5xl">
                <TokenIcon className="size-9 shrink-0" />
                {stage.title}
              </h2>
              <p className="mt-6 max-w-md text-lg leading-snug text-white/70">{stage.doneWhen}</p>
              <div className="mt-6 max-w-md">
                <TokenStatus tone="navy" />
              </div>
            </div>
            <ul className="space-y-1.5 self-end">
              {stage.work.map((item) => (
                <li key={item} className="rounded-lg bg-white/[0.07] px-5 py-4 leading-snug">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      ))}
    </PageShell>
  );
}

// A stage being worked on: the large tile, in the colour of where it stands.
function Large({ stage, className }: { stage: Stage; className: string }) {
  return (
    <Reveal id={`stage-${stage.code}`} className={cn("cut-2 scroll-mt-28 rounded-3xl p-7 text-white md:p-12", className)}>
      <div className="flex items-center justify-between gap-4">
        <p className="label-mono text-white/75">{name(stage)}</p>
        <p className="label-mono flex items-center gap-2 rounded-md bg-white/15 px-2.5 py-1.5">
          <span aria-hidden className="live-dot size-1.5 rounded-full bg-white" />
          {STATUS_LABEL[stage.status]}
        </p>
      </div>
      <h2 className="mt-10 text-5xl leading-[0.95] font-medium tracking-[-0.05em] text-balance md:text-7xl">
        {stage.title}
      </h2>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <Work stage={stage} soft="text-white/75" />
        <div>
          <p className="label-mono text-white/75">Done when</p>
          <p className="mt-3 text-lg leading-snug">{stage.doneWhen}</p>
        </div>
      </div>
    </Reveal>
  );
}

function Group({ label, count }: { label: string; count: number }) {
  return (
    <p className="label-mono flex items-baseline justify-between px-3 pt-12 pb-4 text-muted-foreground md:px-4">
      <span>{label}</span>
      <span>{String(count).padStart(2, "0")}</span>
    </p>
  );
}

function Work({ stage, soft }: { stage: Stage; soft: string }) {
  return (
    <div>
      <p className={cn("label-mono", soft)}>Work</p>
      <ul className="mt-3 space-y-2">
        {stage.work.map((item) => (
          <li key={item} className="flex gap-3 leading-snug">
            <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 bg-current opacity-50" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
