import { advance } from "@/lib/vault-store";

// The vault's count is brought up to the last full hour when the server starts, and again every
// few minutes: an hour is counted soon after it ends, without anyone asking. Nothing is sent to
// the chain and no page waits for it. With the vault switched off this does nothing.
const tick = () =>
  advance().catch((error) => {
    // The chain's endpoint is asked too often now and then. The next round tries again.
    console.error("vault: the count did not advance:", error instanceof Error ? error.message : error);
  });

const timer = globalThis as unknown as { zolaceVaultTimer?: ReturnType<typeof setInterval> };
if (timer.zolaceVaultTimer) clearInterval(timer.zolaceVaultTimer);
timer.zolaceVaultTimer = setInterval(tick, 5 * 60 * 1000);
timer.zolaceVaultTimer.unref?.();
setTimeout(tick, 15_000).unref?.();
