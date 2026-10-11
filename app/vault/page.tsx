import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
import { Reveal } from "@/components/site/reveal";
import { Button } from "@/components/ui/button";
import { ClaimPanel } from "@/components/vault/claim-panel";
import { formatTokens, formatUnitsShort, MINIMUM_UNITS, tokenConfig, vaultLive } from "@/lib/token";
import { listMonths, type FundedMonth } from "@/lib/vault-store";

export const metadata: Metadata = {
  title: "The vault",
  description:
    "How holders of the Zolace token are rewarded: a monthly list, funded in NVDA on Robinhood Chain, claimed from a contract by the wallet.",
};

const MINIMUM = formatTokens(MINIMUM_UNITS);

const RULES = [
  {
    name: "Who is on a list",
    body: `A wallet that held at least ${MINIMUM} tokens from the first block of a calendar month to the last. There is nothing to sign up for.`,
  },
  {
    name: "What counts",
    body: "The lowest balance the wallet had in that month. Dipping under the minimum at any time puts it out for the month.",
  },
  {
    name: "How it is split",
    body: "By that lowest balance, among the wallets that count. The project's own wallets take no part.",
  },
  {
    name: "What is paid",
    body: "NVDA, Robinhood's stock token for NVIDIA, on the chain the token is on. The wallet claims it from the vault's contract.",
  },
];

const SHOWN = [
  "A claim is a transaction on a public chain. The wallet, the amount and the time stay there for anyone to read.",
  "Each month's whole list is public: every wallet on it and its part. That is what lets anyone check it.",
  "This page looks a wallet up in that list inside your browser. The server is not asked about a wallet.",
  "The network your wallet talks to sees what it reads and what it sends, as with any transaction.",
];

const RESTS_ON = [
  "The contract pays what a month's list says and nothing else. The owner cannot take a funded month back or change it. The contract has not been audited.",
  "The list is worked out by the owner from the token's transfers. Anyone can repeat the count, but nothing on the chain does it for them.",
  "How much goes in is the owner's decision each month. No amount is promised, and no month is.",
  "NVDA is Robinhood's token, not this project's. Robinhood describes it as a tokenised debt security and does not offer it in every country. No legal review of handing it to holders has been done.",
];

// The vault is a contract that holds each month's reward and pays it to the wallets on that
// month's list. The top of the page is the same for everyone and is built once; whether the vault
// is open, and which months were funded, is read on each request.
export default function Vault() {
  return (
    <PageShell>
      <PageHead
        figure="rings"
        label="The vault"
        title="How holders are rewarded, and what it rests on."
        facts={["A contract on Robinhood Chain", "Paid in NVDA", "Not an offer"]}
      >
        Once a month the owner puts a reward into the vault&apos;s contract, with the list of wallets
        that held the minimum all month. A wallet on the list claims its part itself. All of it is
        public on the chain.
      </PageHead>

      <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {RULES.map((rule, index) => (
          <li key={rule.name}>
            <Reveal delay={index * 60} className="h-full cut rounded-3xl bg-card p-6">
              <p className="label-mono text-muted-foreground">0{index + 1}</p>
              <p className="mt-6 text-lg font-medium tracking-[-0.03em]">{rule.name}</p>
              <p className="mt-2 text-sm leading-snug text-muted-foreground">{rule.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 grid items-start gap-2.5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Suspense fallback={<div aria-busy className="h-[30rem] cut-2 rounded-3xl bg-card" />}>
          <Claim />
        </Suspense>

        <div className="space-y-2.5">
          <Reveal className="cut rounded-3xl bg-card p-6 md:p-8">
            <p className="label-mono text-brand">What a claim shows</p>
            <List lines={SHOWN} />
          </Reveal>
          <Reveal delay={80} className="cut rounded-3xl bg-ice p-6 text-ink md:p-8">
            <p className="label-mono">What it rests on</p>
            <List lines={RESTS_ON} />
          </Reveal>
        </div>
      </div>

      <Suspense fallback={<div aria-busy className="mt-2.5 h-40 cut rounded-3xl bg-card" />}>
        <Funded />
      </Suspense>
    </PageShell>
  );
}

function List({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-6 space-y-4 leading-snug">
      {lines.map((line) => (
        <li key={line} className="flex gap-3">
          <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 bg-current opacity-50" />
          {line}
        </li>
      ))}
    </ul>
  );
}

// Open or not: the server is told the addresses where it runs, so this is read per request.
async function Claim() {
  await connection();
  const config = tokenConfig();
  const live = vaultLive(config);

  return (
    <div className="cut-2 rounded-3xl bg-card p-7 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label-mono text-muted-foreground">Claim a reward</p>
        <p className="label-mono flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1.5">
          <span aria-hidden className={live ? "live-dot size-1.5 rounded-full bg-signal" : "size-1.5 rounded-full bg-foreground/30"} />
          {live ? "Open" : "Not open"}
        </p>
      </div>

      {live ? (
        <>
          <dl className="mt-6 grid gap-1.5">
            {(
              [
                ["The token", config.address],
                ["The vault", config.vault],
                [`The reward, ${config.reward.symbol}`, config.reward.address],
              ] as const
            ).map(([name, value]) => (
              <div key={name} className="rounded-lg bg-secondary px-4 py-3">
                <dt className="label-mono text-muted-foreground">{name}</dt>
                <dd className="mt-1.5 font-mono text-xs break-all">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm leading-snug text-muted-foreground">
            All three are on network {config.chainId}. Check them against an explorer before you sign anything.
          </p>
        </>
      ) : (
        <p className="mt-6 max-w-xl rounded-xl bg-accent p-5 leading-relaxed text-foreground/85">
          <span className="label-mono mb-2 block text-accent-foreground">Not open</span>
          {config.address
            ? "The vault's contract is not deployed, so there is nothing to claim. This panel opens when it is. No month has been funded and none is promised."
            : "There is no token and no vault yet, so there is nothing to hold and nothing to claim. This panel opens when both contracts exist. Anything offered under this name today is not from this project."}
        </p>
      )}

      <div className="mt-8">
        <ClaimPanel live={live} />
      </div>
    </div>
  );
}

const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

async function Funded() {
  await connection();
  const config = tokenConfig();
  let months: FundedMonth[] = [];
  if (vaultLive(config)) {
    try {
      months = await listMonths();
    } catch {
      months = [];
    }
  }
  const symbol = config.reward?.symbol ?? "NVDA";
  const decimals = config.reward?.decimals ?? 18;

  return (
    <div className="mt-2.5 cut rounded-3xl bg-card p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-2xl font-medium tracking-[-0.035em]">Months funded</h2>
        <p className="max-w-md text-sm leading-snug text-muted-foreground">
          One line per month, recorded only once the contract holds this root and this amount.
        </p>
      </div>

      {months.length === 0 ? (
        <p className="mt-6 rounded-lg bg-secondary px-5 py-4 text-muted-foreground">No month has been funded.</p>
      ) : (
        <ul className="mt-6 space-y-1.5">
          {months.map((month) => (
            <li
              key={month.period}
              className="grid grid-cols-2 items-center gap-x-6 gap-y-2 rounded-lg bg-secondary px-5 py-3.5 md:grid-cols-[6rem_minmax(0,1fr)_7rem_minmax(0,1fr)]"
            >
              <span className="font-mono text-sm text-brand">{month.period}</span>
              <span className="font-mono text-sm">
                {formatUnitsShort(BigInt(month.total), decimals)} {symbol}
              </span>
              <span className="label-mono text-muted-foreground">
                {month.wallets} wallet{month.wallets === 1 ? "" : "s"}
              </span>
              <span className="font-mono text-xs text-muted-foreground md:text-right" title={month.root}>
                root {short(month.root)} · blocks {month.fromBlock} to {month.toBlock}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <PillLink href="/docs/the-token" variant="secondary" arrow>
          Read the token page
        </PillLink>
        <PillLink href="/whitepaper#token" variant="outline">
          The whitepaper on it
        </PillLink>
        {months.length > 0 ? (
          <Button asChild variant="outline">
            <a href="/api/vault/months">Every list, as data</a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
