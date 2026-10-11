import type { Metadata } from "next";

import { countHours } from "@/app/owner/actions";
import { ActionForm } from "@/components/owner/action-form";
import { OwnerFrame, Panel } from "@/components/owner/frame";
import { FundVault, NameSigner, SetRate } from "@/components/owner/vault-tools";
import { listRefundsDue } from "@/lib/admin";
import { requireOwner } from "@/lib/owner-session";
import { formatTokens, formatUnitsShort, HOURLY_CENTS, MINIMUM_UNITS, tokenConfig, vaultLive } from "@/lib/token";
import { hourLabel } from "@/lib/vault";
import { contractsAmong, neverEarn, vaultNow } from "@/lib/vault-chain";
import { signerAddress } from "@/lib/vault-sign";
import { hoursBehind, published, recentHours, type CountedHour, type Published } from "@/lib/vault-store";

export const metadata: Metadata = { title: "Payout" };

// Who is asking is read from the request before any row of this screen is read, so someone who
// is not signed in is sent to the sign-in page and is shown nothing of it.
export const instant = false;

const short = (wallet: string) => `${wallet.slice(0, 8)}…${wallet.slice(-6)}`;
const DOLLARS = `${(Number(HOURLY_CENTS) / 100).toFixed(2)} USD`;

export default async function OwnerPayout() {
  await requireOwner();
  const config = tokenConfig();
  const live = vaultLive(config);
  const due = await listRefundsDue();

  const symbol = config.reward?.symbol ?? "NVDA";
  const decimals = config.reward?.decimals ?? 18;
  const amount = (units: bigint, places = 6) => `${formatUnitsShort(units, decimals, places)} ${symbol}`;

  // The count as the site keeps it, and the contract as the chain has it. Either can fail on its
  // own: a chain that does not answer must not hide the count.
  let list: Published | null = null;
  let hours: CountedHour[] = [];
  let chain: Awaited<ReturnType<typeof vaultNow>> | null = null;
  let left: string[] = [];
  let contracts = new Set<string>();
  let problem: string | null = null;
  if (live) {
    try {
      [list, hours] = await Promise.all([published(), recentHours(24)]);
    } catch {
      problem = "The count could not be read from the database.";
    }
    try {
      [chain, left] = await Promise.all([vaultNow(), neverEarn()]);
      contracts = await contractsAmong((hours[0]?.wallets ?? []).map(([wallet]) => wallet as `0x${string}`));
    } catch (error) {
      problem = error instanceof Error ? error.message.split("\n")[0] : "The chain did not answer.";
    }
  }

  const key = signerAddress();
  const signs = key !== null && chain !== null && chain.signer.toLowerCase() === key.toLowerCase();
  const last = hours[0] ?? null;
  const behind = list ? hoursBehind(list.hour) : 0;
  const unearned = list ? BigInt(list.funded) - BigInt(list.total) : 0n;
  // How long what is in the vault lasts, if the lots of the last hour keep being held at this rate.
  const perHour = chain && last ? chain.rate * BigInt(last.lots) : 0n;
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const lasts = perHour > 0n ? Number(unearned / perHour) : null;

  const how = [
    `A wallet earns by the lot. ${formatTokens(MINIMUM_UNITS)} tokens held through a whole hour is one lot and earns at most ${DOLLARS} for that hour, in ${symbol}. Twice as many is two lots and earns twice that.`,
    `The rate is in ${symbol}, not in dollars. Set it again when the price of ${symbol} has moved, or a lot earns more or less than ${DOLLARS} an hour.`,
    "An hour pays the rate only while the vault holds enough for every lot. When it does not, what is left is shared evenly, and then hours pay nothing until you put more in.",
    "What you put in cannot be taken out again. Keep the vault to what a week or two needs: whoever held this server's signing key could sign a list of their own, and the contract only caps what all wallets together can take.",
    "After each hour the server counts it and signs the list. Holders claim from their own wallets whenever they like. The server sends nothing to the chain.",
  ];

  return (
    <OwnerFrame at="/owner/payout" title="Payout" due={due.length}>
      <div className="grid items-start gap-2.5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-2.5">
          {!live ? (
            <Panel>
              <p className="label-mono text-muted-foreground">Switched off</p>
              <p className="mt-4 leading-relaxed">
                There is no token or no vault, so there is no hour to count. This screen turns on when{" "}
                <span className="font-mono text-sm text-brand">TOKEN_ADDRESS</span> and{" "}
                <span className="font-mono text-sm text-brand">VAULT_ADDRESS</span> are set where the server runs,
                and the reward is on the same network as the token.
              </p>
            </Panel>
          ) : (
            <>
              <Panel>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h2 className="text-2xl font-medium tracking-[-0.035em]">The vault now</h2>
                  <p className="label-mono text-muted-foreground">Paid in {symbol}</p>
                </div>
                {problem ? (
                  <p role="alert" className="mt-4 text-sm leading-snug text-destructive">
                    {problem}
                  </p>
                ) : null}
                <dl className="mt-6 grid grid-cols-2 gap-1.5 md:grid-cols-3">
                  {(
                    [
                      ["Counted up to", list ? hourLabel(list.hour + 1) : "Not started"],
                      ["Hours behind", String(behind)],
                      ["Earning last hour", last ? `${count(last.wallets.length, "wallet")}, ${count(last.lots, "lot")}` : "None"],
                      ["Put in so far", list ? amount(BigInt(list.funded)) : amount(0n)],
                      ["Earned so far", list ? amount(BigInt(list.total)) : amount(0n)],
                      ["Not earned yet", amount(unearned)],
                      ["Taken by holders", chain ? amount(chain.taken) : "Unknown"],
                      ["In the vault", chain ? amount(chain.holds) : "Unknown"],
                      ["Lasts", lasts === null ? "Unknown" : `${lasts} hour${lasts === 1 ? "" : "s"}`],
                    ] as const
                  ).map(([name, value]) => (
                    <div key={name} className="rounded-lg bg-secondary px-4 py-3.5">
                      <dt className="label-mono text-muted-foreground">{name}</dt>
                      <dd className="mt-3 font-mono text-sm font-medium tracking-[-0.02em] break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
                <ActionForm action={countHours} label="Count the hours now" busyLabel="Reading the chain" variant="secondary" className="mt-6" />
              </Panel>

              <Panel>
                <h2 className="text-2xl font-medium tracking-[-0.035em]">Who signs the list</h2>
                {key === null ? (
                  <p role="alert" className="mt-4 rounded-lg bg-destructive/15 px-5 py-4 text-sm leading-relaxed text-destructive">
                    This server has no signing key, so no list is signed and nobody can claim. Set{" "}
                    <span className="font-mono">VAULT_SIGNER_KEY</span> where the server runs.
                  </p>
                ) : (
                  <>
                    <dl className="mt-6 grid gap-1.5 sm:grid-cols-2">
                      <div className="rounded-lg bg-secondary px-4 py-3">
                        <dt className="label-mono text-muted-foreground">This server&apos;s key signs as</dt>
                        <dd className="mt-1.5 font-mono text-xs break-all">{key}</dd>
                      </div>
                      <div className="rounded-lg bg-secondary px-4 py-3">
                        <dt className="label-mono text-muted-foreground">The vault takes lists from</dt>
                        <dd className="mt-1.5 font-mono text-xs break-all">{chain ? chain.signer : "Unknown"}</dd>
                      </div>
                    </dl>
                    {chain === null ? null : signs ? (
                      <p className="mt-4 text-sm leading-snug text-muted-foreground">They are the same: holders can claim.</p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <p role="alert" className="text-sm leading-snug text-destructive">
                          They differ, so the vault refuses every list this server signs and nobody can claim.
                        </p>
                        <NameSigner chainId={config.chainId} vault={config.vault} signer={key} />
                      </div>
                    )}
                  </>
                )}
              </Panel>

              <div className="grid gap-2.5 md:grid-cols-2">
                <Panel>
                  <h2 className="text-2xl font-medium tracking-[-0.035em]">The rate</h2>
                  <p className="mt-3 text-sm leading-snug text-muted-foreground">
                    Now: {chain ? `${formatUnitsShort(chain.rate, decimals, decimals)} ${symbol} an hour for each lot of ${formatTokens(MINIMUM_UNITS)} tokens` : "unknown"}.
                    {chain && chain.rate === 0n ? " At a rate of nothing no hour pays." : ""}
                  </p>
                  <div className="mt-6">
                    <SetRate chainId={config.chainId} vault={config.vault} symbol={symbol} decimals={decimals} cents={HOURLY_CENTS.toString()} />
                  </div>
                </Panel>
                <Panel>
                  <h2 className="text-2xl font-medium tracking-[-0.035em]">Put {symbol} in</h2>
                  <p className="mt-3 text-sm leading-snug text-muted-foreground">
                    A plain transfer to the vault&apos;s address. It cannot be taken back out.
                  </p>
                  <div className="mt-6">
                    <FundVault chainId={config.chainId} vault={config.vault} reward={config.reward.address} symbol={symbol} decimals={decimals} />
                  </div>
                </Panel>
              </div>

              <Panel>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <h2 className="text-2xl font-medium tracking-[-0.035em]">Earning in the last hour counted</h2>
                  <p className="label-mono text-muted-foreground">{last ? hourLabel(last.hour) : ""}</p>
                </div>
                {!last || last.wallets.length === 0 ? (
                  <p className="mt-6 rounded-lg bg-secondary px-5 py-4 text-muted-foreground">
                    No wallet held {formatTokens(MINIMUM_UNITS)} tokens through that hour.
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-sm leading-snug text-muted-foreground">
                      Each lot earned {amount(BigInt(last.each), decimals)} for it.
                    </p>
                    <ul className="mt-4 space-y-1.5">
                      {last.wallets.map(([wallet, lots]) => (
                        <li
                          key={wallet}
                          className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3"
                        >
                          <span className="font-mono text-xs break-all text-brand">
                            {wallet}
                            {contracts.has(wallet) ? (
                              <span className="label-mono ml-2 rounded bg-destructive/20 px-1.5 py-0.5 text-destructive">a contract</span>
                            ) : null}
                          </span>
                          <span className="label-mono text-muted-foreground">{count(lots, "lot")}</span>
                        </li>
                      ))}
                    </ul>
                    {last.wallets.some(([wallet]) => contracts.has(wallet)) ? (
                      <p className="mt-3 text-sm leading-snug text-muted-foreground">
                        A contract is paid only if someone sends its claim, and a pool or a bridge never spends what it
                        is paid. Add it to <span className="font-mono">VAULT_SKIP</span> unless you know it can use the
                        reward. That changes the hours still to come, not the ones counted.
                      </p>
                    ) : null}
                  </>
                )}
                <p className="mt-4 text-sm leading-snug text-muted-foreground">
                  Never earning: {left.length > 0 ? left.map(short).join(", ") : "unknown"}
                </p>
              </Panel>

              <Panel>
                <h2 className="text-2xl font-medium tracking-[-0.035em]">Hours counted</h2>
                {hours.length === 0 ? (
                  <p className="mt-6 rounded-lg bg-secondary px-5 py-4 text-muted-foreground">None yet.</p>
                ) : (
                  <ul className="mt-6 space-y-1.5">
                    {hours.map((entry) => (
                      <li
                        key={entry.hour}
                        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-lg bg-secondary px-5 py-3"
                      >
                        <span className="font-mono text-sm text-brand">{hourLabel(entry.hour)}</span>
                        <span className="label-mono text-muted-foreground">
                          {count(entry.wallets.length, "wallet")}, {count(entry.lots, "lot")}
                        </span>
                        <span className="font-mono text-sm">{amount(BigInt(entry.each), decimals)} a lot</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>

        <Panel className="bg-ice text-ink lg:sticky lg:top-24">
          <p className="label-mono">How it goes</p>
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
