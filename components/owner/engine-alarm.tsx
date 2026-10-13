import { Panel } from "@/components/owner/frame"
import { aboutUntil } from "@/lib/engine-fit"
import { engineFitNow } from "@/lib/payment"

// On the owner's orders screen: whether the payment engine can still read the chain it watches
// (lib/engine-fit.ts). It says nothing while it can and nothing is scheduled. The screen it is on
// has checked who is asking before it draws this.
export async function EngineAlarm() {
  const fit = await engineFitNow().catch(() => null)
  if (!fit || fit.state === "fits" || fit.state === "unknown") return null

  if (fit.state === "unread") {
    return (
      <Panel className="mb-2.5 bg-destructive/15">
        <p className="label-mono text-destructive">The payment engine cannot read the chain</p>
        <h2 className="mt-4 max-w-3xl text-2xl leading-[1.08] font-medium tracking-[-0.035em] text-balance md:text-3xl">
          The Zcash network is on {fit.upgrade}, an upgrade this engine was not built for. No order is being started.
        </h2>
        <ul className="mt-5 max-w-3xl space-y-2 leading-snug text-muted-foreground">
          <li>The engine drops what it cannot read without an error, so its own health still says ok. A payment made now would not be seen.</li>
          <li>Orders that were open when the upgrade took effect may have been paid without the shop seeing it. Check them against your own wallet, and refund from there.</li>
          <li>Rebuild the engine for the new upgrade (engine/cipherpay/), add its branch to ENGINE_READS in lib/engine-fit.ts, and deploy. Orders start again by themselves.</li>
        </ul>
      </Panel>
    )
  }

  return (
    <Panel className="mb-2.5 bg-accent">
      <p className="label-mono text-accent-foreground">A network upgrade is scheduled</p>
      <h2 className="mt-4 max-w-3xl text-2xl leading-[1.08] font-medium tracking-[-0.035em] text-balance">
        {fit.next} takes effect at block {fit.atBlock.toLocaleString("en-US")}, in {aboutUntil(fit.blocksLeft)}. This engine cannot
        read it yet.
      </h2>
      <p className="mt-4 max-w-3xl leading-snug text-muted-foreground">
        Orders run as usual until then. From that block the shop starts no order, and a payment would not be seen, until the engine
        is rebuilt for the upgrade and its branch is added to ENGINE_READS in lib/engine-fit.ts.
      </p>
    </Panel>
  )
}
