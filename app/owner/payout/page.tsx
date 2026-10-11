import type { Metadata } from "next";

import { monthFunded } from "@/app/owner/actions";
import { ActionForm } from "@/components/owner/action-form";
import { Field, OwnerFrame, Panel } from "@/components/owner/frame";
import { FundPanel } from "@/components/owner/fund-panel";
import { CopyButton } from "@/components/site/copy-button";
import { Button } from "@/components/ui/button";
import { listRefundsDue } from "@/lib/admin";
import { requireOwner } from "@/lib/owner-session";
import { formatTokens, formatUnitsShort, MINIMUM_UNITS, parseUnitsExact, tokenConfig, vaultLive } from "@/lib/token";
import { lastMonth, parseWallets } from "@/lib/vault";
import { fundedMonth } from "@/lib/vault-chain";
import { listMonths, monthSheet, type Sheet } from "@/lib/vault-store";

export const metadata: Metadata = { title: "Payout" };

// Who is asking is read from the request before any row of this screen is read, so someone who
// is not signed in is sent to the sign-in page and is shown nothing of it.
export const instant = false;

const short = (wallet: string) => `${wallet.slice(0, 8)}…${wallet.slice(-6)}`;

export default async function OwnerPayout({ searchParams }: PageProps<"/owner/payout">) {
  await requireOwner();
  const params = await searchParams;
  const config = tokenConfig();
  const live = vaultLive(config);
  const [due, recorded] = await Promise.all([listRefundsDue(), live ? listMonths() : []]);

  const symbol = config.reward?.symbol ?? "NVDA";
  const decimals = config.reward?.decimals ?? 18;
  const amount = (units: bigint) => `${formatUnitsShort(units, decimals)} ${symbol}`;

  const asked = typeof params.month === "string";
  const month = typeof params.month === "string" ? params.month : lastMonth();
  const pool = typeof params.pool === "string" ? params.pool : "";
  const skip = typeof params.skip === "string" ? params.skip : "";

  // The list is worked out when the owner asks for a month, from the chain as it is now.
  let sheet: Sheet | null = null;
  let onChain: Awaited<ReturnType<typeof fundedMonth>> | null = null;
  let problem: string | null = null;
  if (asked && live) {
    const units = parseUnitsExact(pool, decimals);
    const left = parseWallets(skip);
    if (units === null || units === 0n) problem = `The amount has to be in ${symbol}, like 1.5.`;
    else if (left === null) problem = "One of the wallets to leave out is not an address.";
    else {
      try {
        sheet = await monthSheet(month, units, left);
        onChain = await fundedMonth(sheet.id);
      } catch (error) {
        sheet = null;
        problem = error instanceof Error ? error.message.split("\n")[0] : "The month could not be worked out.";
      }
    }
  }
  const already = recorded.some((entry) => entry.period === month);
  // The contract holds a month for good. If it holds this one, it has to be this very list.
  const same =
    sheet !== null && onChain !== null && sheet.root !== null && onChain.root.toLowerCase() === sheet.root.toLowerCase() && onChain.total === sheet.total;

  const how = [
    `Pick a month that is over and say how much ${symbol} goes in. The amount is yours to decide: what the token's fee and the shop's share bought.`,
    "The list shows each wallet that held the minimum all month, and its part by lowest balance. Leave out a contract that could never claim, such as an exchange pool.",
    "Fund the month from the wallet that owns the vault. The server sends nothing: it has no key that can. A funded month cannot be changed or taken back.",
    "Then record the month. It is kept only if the contract holds the same root and the same amount, and holders can claim from then on.",
  ];

  return (
    <OwnerFrame at="/owner/payout" title="Payout" due={due.length}>
      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-2.5">
          {live ? (
            <Panel>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="text-2xl font-medium tracking-[-0.035em]">A month&apos;s list</h2>
                <p className="label-mono text-muted-foreground">Paid in {symbol}</p>
              </div>
              <form method="get" action="/owner/payout" className="mt-6 space-y-4">
                <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <Field label="Month" name="month" type="month" defaultValue={month} required />
                  <Field
                    label={`${symbol} to share`}
                    name="pool"
                    inputMode="decimal"
                    placeholder="1.5"
                    defaultValue={pool}
                    required
                  />
                </div>
                <label className="block">
                  <span className="label-mono text-muted-foreground">Wallets to leave out</span>
                  <textarea
                    name="skip"
                    rows={2}
                    defaultValue={skip}
                    placeholder="0x…  one per line. The token's owner, its fee collector and the vault are left out already."
                    spellCheck={false}
                    className="mt-2 w-full rounded-lg bg-secondary px-4 py-3 font-mono text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/40"
                  />
                </label>
                <Button type="submit" className="h-11">
                  Work it out
                </Button>
              </form>
              {problem ? (
                <p role="alert" className="mt-4 text-sm leading-snug text-destructive">
                  {problem}
                </p>
              ) : null}
            </Panel>
          ) : (
            <Panel>
              <p className="label-mono text-muted-foreground">Switched off</p>
              <p className="mt-4 leading-relaxed">
                There is no token or no vault, so there is no month to work out. This screen turns on when{" "}
                <span className="font-mono text-sm text-brand">TOKEN_ADDRESS</span> and{" "}
                <span className="font-mono text-sm text-brand">VAULT_ADDRESS</span> are set where the server runs,
                and the reward is on the same network as the token.
              </p>
            </Panel>
          )}

          {sheet && live ? (
            <Panel>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="text-2xl font-medium tracking-[-0.035em]">{sheet.period}</h2>
                <p className="label-mono text-muted-foreground">
                  blocks {String(sheet.fromBlock)} to {String(sheet.toBlock)}
                </p>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-1.5 md:grid-cols-4">
                {(
                  [
                    ["Wallets ever", String(sheet.holders)],
                    ["On the list", String(sheet.lines.length)],
                    ["Goes in", amount(sheet.total)],
                    ["Left by rounding", `${sheet.left} unit${sheet.left === 1n ? "" : "s"}`],
                  ] as const
                ).map(([name, value]) => (
                  <div key={name} className="rounded-lg bg-secondary px-4 py-3.5">
                    <dt className="label-mono text-muted-foreground">{name}</dt>
                    <dd className="mt-3 font-mono text-lg font-medium tracking-[-0.03em]">{value}</dd>
                  </div>
                ))}
              </dl>

              {sheet.lines.length === 0 || sheet.root === null ? (
                <p className="mt-6 rounded-lg bg-secondary px-5 py-4 text-muted-foreground">
                  No wallet held {formatTokens(MINIMUM_UNITS)} tokens for the whole month. There is nothing to fund.
                </p>
              ) : (
                <>
                  <ul className="mt-6 space-y-1.5">
                    {sheet.lines.map((line) => (
                      <li
                        key={line.wallet}
                        className="grid grid-cols-1 items-baseline gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                      >
                        <span className="font-mono text-xs break-all text-brand">
                          {line.wallet}
                          {line.contract ? (
                            <span className="label-mono ml-2 rounded bg-destructive/20 px-1.5 py-0.5 text-destructive">
                              a contract
                            </span>
                          ) : null}
                        </span>
                        <span className="label-mono text-muted-foreground">lowest {formatTokens(line.lowest)}</span>
                        <span className="font-mono text-sm font-medium">{amount(line.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  {sheet.lines.some((line) => line.contract) ? (
                    <p className="mt-3 text-sm leading-snug text-muted-foreground">
                      A contract is paid only if someone sends its claim, and a pool or a bridge never spends what it is
                      paid. Leave it out unless you know it can use the reward.
                    </p>
                  ) : null}

                  <div className="mt-6 rounded-lg bg-secondary px-5 py-4">
                    <p className="label-mono text-muted-foreground">The root of this list</p>
                    <p className="mt-2 font-mono text-xs break-all">{sheet.root}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <CopyButton
                      text={sheet.lines.map((line) => `${line.wallet},${line.amount}`).join("\n")}
                      variant="secondary"
                    >
                      Copy as wallet,units
                    </CopyButton>
                    <p className="text-sm leading-snug text-muted-foreground">
                      Left out: {sheet.skipped.map(short).join(", ")}
                    </p>
                  </div>

                  {already ? (
                    <p className="mt-6 rounded-lg bg-accent px-5 py-4 text-sm leading-relaxed">
                      This month is funded and recorded. Holders can claim it.
                      {onChain && !same
                        ? ` It was funded with ${amount(onChain.total)}: the list above is not the one the contract holds.`
                        : null}
                    </p>
                  ) : onChain?.funded && !same ? (
                    <p role="alert" className="mt-6 rounded-lg bg-destructive/15 px-5 py-4 text-sm leading-relaxed text-destructive">
                      The contract already holds this month with another list: {amount(onChain.total)} under root{" "}
                      {short(onChain.root)}. A month is funded once. Enter the amount and the wallets left out as they
                      were then, to record it.
                    </p>
                  ) : (
                    <div className="mt-6 space-y-6">
                      {onChain?.funded ? (
                        <p className="rounded-lg bg-accent px-5 py-4 text-sm leading-relaxed">
                          The contract holds this month with this very list. It only has to be recorded.
                        </p>
                      ) : (
                        <div>
                          <p className="label-mono text-muted-foreground">1. Fund the month</p>
                          <div className="mt-3">
                            <FundPanel
                              chainId={config.chainId}
                              vault={config.vault}
                              reward={config.reward.address}
                              symbol={symbol}
                              id={sheet.id}
                              root={sheet.root}
                              total={sheet.total.toString()}
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="label-mono text-muted-foreground">{onChain?.funded ? "Record the month" : "2. Record the month"}</p>
                        <ActionForm action={monthFunded} label="Record the month" busyLabel="Checking the contract" variant="secondary" className="mt-3">
                          <input type="hidden" name="month" value={sheet.period} />
                          <input type="hidden" name="pool" value={pool} />
                          <input type="hidden" name="skip" value={skip} />
                        </ActionForm>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Panel>
          ) : null}

          <Panel>
            <h2 className="text-2xl font-medium tracking-[-0.035em]">Months recorded</h2>
            {recorded.length === 0 ? (
              <p className="mt-6 rounded-lg bg-secondary px-5 py-4 text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-6 space-y-1.5">
                {recorded.map((entry) => (
                  <li
                    key={entry.period}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3.5"
                  >
                    <span className="font-mono text-sm text-brand">{entry.period}</span>
                    <span className="font-mono text-sm">{amount(BigInt(entry.total))}</span>
                    <span className="label-mono text-muted-foreground">
                      {entry.wallets} wallet{entry.wallets === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel className="bg-ice text-ink lg:sticky lg:top-24">
          <p className="label-mono">How a month goes</p>
          <ol className="mt-6 space-y-4 leading-snug">
            {how.map((line, index) => (
              <li key={line} className="flex gap-3">
                <span className="label-mono mt-0.5 shrink-0">0{index + 1}</span>
                {line}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </OwnerFrame>
  );
}
