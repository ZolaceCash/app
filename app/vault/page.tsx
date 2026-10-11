import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { PageHead, PageShell } from "@/components/site/page-shell";
import { PillLink } from "@/components/site/primitives";
import { Reveal } from "@/components/site/reveal";
import { Button } from "@/components/ui/button";
import { ClaimPanel } from "@/components/vault/claim-panel";
import { formatTokens, formatUnitsShort, HOURLY_CENTS, MINIMUM_UNITS, tokenConfig, vaultLive } from "@/lib/token";
import { hourLabel } from "@/lib/vault";
import { published, recentHours, type CountedHour, type Published } from "@/lib/vault-store";

export const metadata: Metadata = {
  title: "The vault",
  description:
    "How holders of the Zolace token are rewarded: an hourly list, paid in NVDA on Robinhood Chain, claimed from a contract by the wallet.",
};

const MINIMUM = formatTokens(MINIMUM_UNITS);
const HOURLY = `${(Number(HOURLY_CENTS) / 100).toFixed(2)} USD`;

const RULES = [
  {
    name: "Who earns an hour",
    body: `A wallet that held at least ${MINIMUM} tokens from the first block of the hour to the last. There is nothing to sign up for.`,
  },
  {
    name: "What an hour pays",
    body: `At most ${HOURLY} for every ${MINIMUM} tokens held through it. Twice as many earns twice that; what is over a whole multiple earns nothing.`,
  },
  {
    name: "Where it comes from",
    body: "The fee the launchpad pays the token's creator on trades. The owner puts it into the vault as NVDA. An hour pays less, or nothing, when the vault holds less.",
  },
  {
    name: "How it is taken",
    body: "In NVDA, Robinhood's stock token for NVIDIA, on the chain the token is on. What a wallet has earned waits in the vault until the wallet claims it.",
  },
];

const SHOWN = [
  "A claim is a transaction on a public chain. The wallet, the amount and the time stay there for anyone to read.",
  "The whole list is public: every wallet that has earned anything, and how much. That is what lets anyone check it.",
  "This page looks a wallet up in that list inside your browser. The server is not asked about a wallet.",
  "The network your wallet talks to sees what it reads and what it sends, as with any transaction.",
];

const RESTS_ON = [
  `${HOURLY} an hour for every ${MINIMUM} tokens is a ceiling, not a promise. It is set in NVDA at a price the owner types in, so it drifts as that price moves, and no hour is owed.`,
  "The list is worked out by this site from the token's transfers and signed with a key the server holds. Anyone can repeat the count, but nothing on the chain does it for them.",
  "The contract checks the signature, never pays the same earnings twice, and never pays all wallets together more than the rate allows for the whole supply. It does not check that the list is right. It has not been audited.",
  "Whoever held the server's signing key, or the owner's key, could sign a list of their own within that limit. What sits in the vault is not a holder's until it is claimed.",
  "NVDA is Robinhood's token, not this project's. Robinhood describes it as a tokenised debt security and does not offer it in every country. No legal review of handing it to holders has been done.",
];

// The vault is a contract that holds the reward and pays each wallet what the hourly list says it
// has earned. The top of the page is the same for everyone and is built once; whether the vault is
// open, and which hours were counted, is read on each request.
export default function Vault() {
  return (
    <PageShell>
      <PageHead
        figure="rings"
        label="The vault"
        title="How holders are rewarded, and what it rests on."
        facts={["A contract on Robinhood Chain", "Paid in NVDA", "Not an offer"]}
      >
        A wallet that holds {MINIMUM} tokens through a whole hour earns that hour: at most {HOURLY},
        in NVDA, for every {MINIMUM} it holds. What it has earned waits in the vault&apos;s contract, and the wallet claims it itself,
        whenever it likes. All of it is public on the chain.
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
        <Counted />
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
            ? "The vault's contract is not deployed, so nothing is earned and there is nothing to claim. This panel opens when it is. No hour is promised."
            : "There is no token and no vault yet, so there is nothing to hold and nothing to claim. This panel opens when both exist. Anything offered under this name today is not from this project."}
        </p>
      )}

      <div className="mt-8">
        <ClaimPanel live={live} />
      </div>
    </div>
  );
}

const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

async function Counted() {
  await connection();
  const config = tokenConfig();
  let list: Published | null = null;
  let hours: CountedHour[] = [];
  if (vaultLive(config)) {
    try {
      [list, hours] = await Promise.all([published(), recentHours(12)]);
    } catch {
      hours = [];
    }
  }
  const symbol = config.reward?.symbol ?? "NVDA";
  const decimals = config.reward?.decimals ?? 18;
  const amount = (units: string) => `${formatUnitsShort(BigInt(units), decimals, 9)} ${symbol}`;

  return (
    <div className="mt-2.5 cut rounded-3xl bg-card p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-2xl font-medium tracking-[-0.035em]">Hours counted</h2>
        <p className="max-w-md text-sm leading-snug text-muted-foreground">
          One line per hour: how many wallets held the minimum through it, how many lots of {MINIMUM} they
          held between them, and what each lot earned.
        </p>
      </div>

      {list ? (
        <dl className="mt-6 grid gap-1.5 sm:grid-cols-3">
          {(
            [
              ["Put into the vault", amount(list.funded)],
              ["Earned by holders", amount(list.total)],
              ["Wallets on the list", String(list.list.length)],
            ] as const
          ).map(([name, value]) => (
            <div key={name} className="rounded-lg bg-secondary px-4 py-3.5">
              <dt className="label-mono text-muted-foreground">{name}</dt>
              <dd className="mt-3 font-mono text-sm font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {hours.length === 0 ? (
        <p className="mt-6 rounded-lg bg-secondary px-5 py-4 text-muted-foreground">No hour has been counted.</p>
      ) : (
        <ul className="mt-6 space-y-1.5">
          {hours.map((entry) => (
            <li
              key={entry.hour}
              className="grid grid-cols-2 items-center gap-x-6 gap-y-2 rounded-lg bg-secondary px-5 py-3.5 md:grid-cols-[11rem_9rem_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <span className="font-mono text-sm text-brand">{hourLabel(entry.hour)}</span>
              <span className="label-mono text-muted-foreground">
                {entry.wallets.length} wallet{entry.wallets.length === 1 ? "" : "s"}, {entry.lots} lot{entry.lots === 1 ? "" : "s"}
              </span>
              <span className="font-mono text-sm">{amount(entry.each)} a lot</span>
              <span className="font-mono text-xs text-muted-foreground md:text-right" title={entry.root ?? undefined}>
                {entry.root ? `root ${short(entry.root)} · ` : ""}blocks {entry.fromBlock} to {entry.toBlock}
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
        {list ? (
          <Button asChild variant="outline">
            <a href="/api/vault/list">The whole list, as data</a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
